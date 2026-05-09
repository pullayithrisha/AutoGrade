from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import json
import re
import os
from dotenv import load_dotenv
load_dotenv()
from google import genai
from sentence_transformers import SentenceTransformer, util

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Loading Sentence-BERT...")
sts_model = SentenceTransformer('all-mpnet-base-v2')
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY", ""))

def process_answer_key(key_text):
    pattern = r"Q(\d+)\)\s*\((\d+)[mM]?\)\s*(.*?)\n\s*A\d+\)\s*\n*(.*?)(?=\nQ\d+\)|\Z)"
    matches = re.findall(pattern, key_text, re.DOTALL)
    return [{
        "q_no": int(m[0]),
        "marks": int(m[1]),
        "question": m[2].strip(),
        "master_answer": m[3].strip()
    } for m in matches]

@app.post("/evaluate")
async def evaluate_submission(answer_key: UploadFile = File(...), student_sheet: UploadFile = File(...)):
    try:
        key_content = await answer_key.read()
        master_key_data = process_answer_key(key_content.decode("utf-8"))

        temp_file_path = f"temp_{student_sheet.filename}"
        with open(temp_file_path, "wb") as f:
            f.write(await student_sheet.read())

        gemini_file = client.files.upload(file=temp_file_path)

        prompt = """
        You are an expert grading assistant. Analyze the provided file(s) of a student's handwritten answer sheet. 
        
        Your task is to extract all the handwritten text and organize it perfectly into a single JSON object.
        
        Strict Rules:
        1. Output ONLY a valid JSON object. No markdown, no conversational text.
        2. The keys must be the question numbers (e.g., "Question_1", "Question_2", "Question_3", etc.)
        3. The values must be the student's complete handwritten answer.
        4. Preserve line breaks using \\n
        5. Ignore crossed-out words.
        """

        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[prompt, gemini_file]
        )

        client.files.delete(name=gemini_file.name)
        os.remove(temp_file_path)

        raw_output = response.text
        cleaned_json = re.sub(r"```json\n|\n```|```", "", raw_output).strip()
        student_data = json.loads(cleaned_json)

        results = []
        total_earned = 0.0
        total_possible = 0

        for item in master_key_data:
            q_no = item['q_no']
            max_marks = item['marks']
            master_ans = item['master_answer']
            student_q_key = f"Question_{q_no}"

            total_possible += max_marks

            if student_q_key in student_data:
                student_ans = student_data[student_q_key]

                master_emb = sts_model.encode(master_ans, convert_to_tensor=True)
                student_emb = sts_model.encode(student_ans, convert_to_tensor=True)

                # 1. Semantic Score
                semantic_score = max(float(util.cos_sim(master_emb, student_emb).item()), 0.0)
                semantic_score = min(semantic_score, 1.0)

                # 2. Keyword Score
                import string
                words_m = master_ans.lower().translate(str.maketrans('', '', string.punctuation)).split()
                words_s = student_ans.lower().translate(str.maketrans('', '', string.punctuation)).split()

                master_kws = set(w for w in words_m if len(w) > 3)
                student_kws = set(w for w in words_s if len(w) > 3)

                keyword_score = len(master_kws.intersection(student_kws)) / max(len(master_kws), 1)

                # 3. Concept Score
                if semantic_score >= 0.75:
                    concept_score = 1.0
                elif semantic_score >= 0.4:
                    concept_score = 0.5
                else:
                    concept_score = 0.0

                # 4. Coverage Score
                m_sentences = [s.strip() for s in re.split(r'[.!?]', master_ans) if len(s.strip()) > 5]
                if not m_sentences:
                    m_sentences = [master_ans]

                covered_components = 0
                for m_sent in m_sentences:
                    m_s_emb = sts_model.encode(m_sent, convert_to_tensor=True)
                    s_sim = max(float(util.cos_sim(m_s_emb, student_emb).item()), 0.0)
                    if s_sim >= 0.35:
                        covered_components += 1

                coverage_ratio = covered_components / max(len(m_sentences), 1)

                if coverage_ratio >= 0.7:
                    coverage_score = 1.0
                elif coverage_ratio >= 0.3:
                    coverage_score = 0.5
                else:
                    coverage_score = 0.0

                # 5. Hybrid Score
                base_hybrid = (0.6 * semantic_score) + (0.25 * keyword_score) + (0.15 * concept_score)

                # 6. Apply Coverage
                final_score = base_hybrid * coverage_score
                final_score = max(0.0, min(final_score, 1.0))

                # 7. Scaling
                # Completely remove the artificial 20% floor. Non-linear scaling handles drops steeply natively
                awarded = (final_score ** 1.3) * max_marks
                # 8. Override Rules
                if semantic_score >= 0.85 and concept_score >= 0.9 and coverage_score == 1.0:
                    awarded = max_marks
                elif base_hybrid >= 0.80 and coverage_score < 1.0:
                    awarded = 0.9 * max_marks
                elif base_hybrid >= 0.75 and coverage_score < 1.0:
                    awarded = 0.8 * max_marks
                elif base_hybrid >= 0.60 and coverage_score < 1.0:
                    awarded = 0.65 * max_marks

                awarded = round(min(awarded, float(max_marks)), 1)

                total_earned += awarded

                results.append({
                    "question": q_no,
                    "max_marks": max_marks,
                    "awarded": awarded,
                    "student_text": student_ans,
                    "similarity": round(semantic_score, 2)
                })

        # 🔹 Store original score BEFORE rounding
        raw_total = total_earned

        # 9. Topper Rule
        if total_earned >= 0.94 * total_possible:
            total_earned = float(total_possible)

        return {
            "total_score": round(total_earned, 1),
            "total_possible": total_possible,
            "percentage": round((raw_total / total_possible) * 100, 1) if total_possible > 0 else 0,
            "details": results
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))