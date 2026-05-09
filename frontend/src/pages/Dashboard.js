import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, UploadCloud, FileText, CheckCircle, AlertCircle, Zap, BookOpen, User, Search, RefreshCw, Save, Menu, ChevronRight, X, Clock, Home } from 'lucide-react';

const pageVariants = {
  initial: { opacity: 0, y: 15 },
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: -15 }
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [faculty, setFaculty] = useState(null);
  const [evaluations, setEvaluations] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const [selectedConfigIdx, setSelectedConfigIdx] = useState(0);
  const [selectedSubject, setSelectedSubject] = useState('');
  
  const [studentRollSuffix, setStudentRollSuffix] = useState('');
  const [calculatedRollString, setCalculatedRollString] = useState('...');
  const [fullRollNumber, setFullRollNumber] = useState('');
  
  const [answerKey, setAnswerKey] = useState(null);
  const [studentSheet, setStudentSheet] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [isViewingHistory, setIsViewingHistory] = useState(false);

  useEffect(() => {
    const data = localStorage.getItem('faculty');
    if (!data) return navigate('/login');
    const parsed = JSON.parse(data);
    setFaculty(parsed);
    
    if (parsed.teachingConfig && parsed.teachingConfig.length > 0) {
      setSelectedConfigIdx(0);
      setSelectedSubject(parsed.teachingConfig[0].subjects[0] || '');
    }
    
    fetchEvaluations();
  }, [navigate]);

  const fetchEvaluations = async () => {
    try {
      const res = await axios.get('http://localhost:5000/api/evaluations', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setEvaluations(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (faculty && faculty.teachingConfig.length > 0) {
      const activeConfig = faculty.teachingConfig[selectedConfigIdx];
      if (activeConfig) {
        if (!activeConfig.subjects.includes(selectedSubject)) {
          setSelectedSubject(activeConfig.subjects[0] || '');
        }
        const yy = 26 - parseInt(activeConfig.year);
        const prefix = `1601${yy}733`;
        
        if (studentRollSuffix.length === 3) {
          setCalculatedRollString(`${prefix}${studentRollSuffix}`);
          setFullRollNumber(`${prefix}${studentRollSuffix}`);
        } else {
          setCalculatedRollString(`${prefix}***`);
          setFullRollNumber('');
        }
      }
    }
  }, [faculty, selectedConfigIdx, studentRollSuffix, selectedSubject]);

  const handleEvaluate = async () => {
    if (!answerKey || !studentSheet) return setError('Please upload required files (Answer Key & Student Sheet).');
    if (studentRollSuffix.length !== 3) return setError('Please enter the 3-digit roll number suffix.');
    
    // Calculate values locally to avoid race conditions with useEffect state updates
    const currentConfig = faculty.teachingConfig[selectedConfigIdx];
    const yy = 26 - parseInt(currentConfig.year);
    const prefix = `1601${yy}733`;
    const currentFullRollNumber = `${prefix}${studentRollSuffix}`;
    const currentSubject = selectedSubject;

    setError(''); setLoading(true); setResults(null); setSaveMessage(''); setIsViewingHistory(false);
    
    const formData = new FormData();
    formData.append('answerKey', answerKey);
    formData.append('studentSheet', studentSheet);

    try {
      const res = await axios.post('http://localhost:5000/api/grade', formData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setResults({ ...res.data, studentRollNumber: currentFullRollNumber, subject: currentSubject });
    } catch (err) {
      setError(err.response?.data?.message || 'Server error.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveResult = async () => {
    if (isViewingHistory) return; 
    try {
      setLoading(true);
      await axios.post('http://localhost:5000/api/evaluations/save', {
        studentRollNumber: results.studentRollNumber,
        subject: selectedSubject,
        year: parseInt(faculty.teachingConfig[selectedConfigIdx].year),
        semester: parseInt(faculty.teachingConfig[selectedConfigIdx].semester),
        totalMarks: results.total_score,
        percentage: results.percentage,
        totalPossible: results.total_possible,
        details: results.details
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      setSaveMessage('Archive Saved Successfully');
      fetchEvaluations();
      setTimeout(() => {
        resetEval();
      }, 1500);
    } catch (err) {
      setError('Database commit failed.');
    } finally {
      setLoading(false);
    }
  };

  const resetEval = () => {
    setResults(null);
    setStudentSheet(null);
    setStudentRollSuffix('');
    setSaveMessage('');
    setIsViewingHistory(false);
  };

  const viewHistoryEvaluation = (evalData) => {
    setIsViewingHistory(true);
    setResults({
      studentRollNumber: evalData.studentRollNumber,
      total_score: evalData.totalMarks,
      percentage: evalData.percentage,
      total_possible: evalData.totalPossible || (evalData.percentage > 0 ? Math.round((evalData.totalMarks / evalData.percentage) * 100) : 0),
      details: evalData.details,
      subject: evalData.subject
    });
    setFullRollNumber(evalData.studentRollNumber);
    if(window.innerWidth < 1024) setSidebarOpen(false);
  };

  if (!faculty) return <div className="min-h-screen bg-background" />;
  const activeConfig = faculty.teachingConfig[selectedConfigIdx] || {};

  const tree = {};
  evaluations.forEach(ev => {
    const y = ev.year || 'Unknown Year';
    const s = ev.semester || 1;
    if (!tree[y]) tree[y] = {};
    if (!tree[y][s]) tree[y][s] = {};
    if (!tree[y][s][ev.subject]) tree[y][s][ev.subject] = [];
    tree[y][s][ev.subject].push(ev);
  });

  return (
    <motion.div initial="initial" animate="in" exit="out" variants={pageVariants} transition={{ duration: 0.3 }} className="flex h-screen bg-background font-sans text-foreground overflow-hidden">
      
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30"
            />
            <motion.div 
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="fixed lg:relative h-full w-[300px] bg-card border-r border-border flex flex-col shrink-0 overflow-hidden z-40 shadow-2xl"
            >
              <div className="p-4 border-b border-white/5 flex items-center justify-between bg-card/50">
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted flex items-center"><Clock className="w-4 h-4 mr-2 text-primary"/> Database History</span>
                <button onClick={() => setSidebarOpen(false)} className="text-muted hover:text-white transition-colors bg-white/5 p-1 rounded-md border border-white/10"><X className="w-4 h-4"/></button>
              </div>
              <div className="flex-grow overflow-y-auto p-4 space-y-6">
                {Object.keys(tree).length === 0 ? (
                  <div className="text-[10px] text-muted text-center uppercase tracking-widest leading-loose mt-10 opacity-50">No records found.</div>
                ) : (
                  Object.keys(tree).sort().map(year => (
                    <div key={year} className="space-y-4">
                      {Object.keys(tree[year]).sort().map(sem => (
                        <div key={sem}>
                          <h4 className="text-[10px] font-bold text-foreground mb-3 flex items-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary mr-2"></div> Year {year} - Semester {sem}
                          </h4>
                          <div className="space-y-3 pl-3 border-l border-white/5 ml-1">
                            {Object.keys(tree[year][sem]).map(sub => (
                              <div key={sub}>
                                <h5 className="text-[10px] font-bold uppercase tracking-widest mb-1 text-blue-300">Subject: {sub}</h5>
                                <div className="space-y-1">
                                  {tree[year][sem][sub].map(ev => (
                                    <motion.button 
                                      whileHover={{ x: 3, backgroundColor: 'rgba(255,255,255,0.05)' }}
                                      onClick={() => viewHistoryEvaluation(ev)}
                                      key={ev._id} 
                                      className="w-full text-left p-2 rounded-md transition-all flex items-center justify-between group"
                                    >
                                      <span className="text-xs font-mono text-foreground font-semibold group-hover:text-blue-300 transition-colors">{ev.studentRollNumber}</span>
                                      <span className="text-[10px] text-emerald-400 font-bold">{ev.totalMarks} <span className="opacity-50 text-muted">pts</span></span>
                                    </motion.button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col h-full bg-background relative min-w-0">
        
        <header className="border-b border-border bg-card/50 backdrop-blur-md shrink-0 h-14 flex items-center justify-between px-4 sm:px-6 z-30">
          <div className="flex items-center space-x-4">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 text-muted hover:text-white bg-white/5 rounded-md border border-white/10 transition-colors">
              <Menu className="w-4 h-4" />
            </motion.button>
            <div className="flex items-center space-x-2">
              <BookOpen className="w-4 h-4 text-primary" />
              <span className="font-extrabold text-sm tracking-tight text-foreground">AutoGrade</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-6">
            <Link to="/" className="text-[11px] font-bold uppercase tracking-widest text-muted hover:text-white transition-colors flex items-center">
              <Home className="w-3.5 h-3.5 mr-1" /> Home
            </Link>
            <div className="hidden md:flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-bold text-[11px] uppercase tracking-widest text-muted">{faculty.name}</span>
            </div>
            <button onClick={() => { localStorage.clear(); navigate('/login'); }} className="text-[11px] font-bold uppercase tracking-widest text-muted hover:text-red-400 transition-colors flex items-center">
              <LogOut className="w-3.5 h-3.5 mr-1" /> Logout
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 pb-20">
          <div className="max-w-6xl mx-auto flex flex-col gap-5 h-full relative">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px] pointer-events-none -z-10"></div>
            
            {!isViewingHistory && (
              <div className="flex flex-col md:flex-row items-center gap-3 bg-card/60 border border-border p-2.5 rounded-lg shrink-0 overflow-hidden relative z-10">
                <div className="flex items-center bg-[#151b23] border border-white/5 rounded-md px-3 py-1 flex-1 min-w-[200px]">
                  <User className="w-3.5 h-3.5 text-primary opacity-70" />
                  <select className="bg-transparent text-[11px] font-bold text-foreground focus:outline-none appearance-none py-1.5 pl-2 cursor-pointer w-full transition-colors" value={selectedConfigIdx} onChange={e => setSelectedConfigIdx(e.target.value)}>
                    {faculty.teachingConfig.map((tc, idx) => <option key={idx} value={idx} className="bg-card text-white">Year {tc.year} - Semester {tc.semester}</option>)}
                  </select>
                </div>
                <div className="text-muted"><ChevronRight className="w-3.5 h-3.5" /></div>
                <div className="flex items-center bg-[#151b23] border border-white/5 rounded-md px-3 py-1 flex-grow">
                  <Search className="w-3.5 h-3.5 text-primary opacity-70" />
                  <select className="bg-transparent text-[11px] font-bold text-foreground focus:outline-none appearance-none py-1.5 pl-2 cursor-pointer w-full transition-colors" value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
                    {(activeConfig.subjects || []).map(sub => <option key={sub} value={sub} className="bg-card text-white">Subject: {sub}</option>)}
                  </select>
                </div>
              </div>
            )}

            <AnimatePresence>
              {error && (
                <motion.div initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} exit={{opacity:0, height:0}} className="overflow-hidden relative z-10">
                  <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg flex items-center text-[11px] font-bold uppercase tracking-widest">
                    <AlertCircle className="w-4 h-4 mr-2 shrink-0"/> {error}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-col lg:flex-row gap-5 flex-grow min-h-[400px] relative z-10">
              
              {!isViewingHistory && !results && (
                <motion.div initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} exit={{opacity:0, width:0}} className="lg:w-72 shrink-0 flex flex-col gap-5">
                  <div className="bg-card/80 backdrop-blur-md border border-border rounded-xl p-4 flex flex-col shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted mb-3 border-b border-white/5 pb-2">Student Identity</h3>
                    <input type="text" maxLength={3} placeholder="054" className="block w-full px-3 py-2 text-xs font-semibold font-mono text-foreground bg-[#151b23] border border-border hover:border-gray-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary transition-all mb-3 text-center" value={studentRollSuffix} onChange={e => setStudentRollSuffix(e.target.value.replace(/\D/g, ''))} />
                    <div className="h-9 flex items-center justify-center bg-primary rounded-lg text-xs font-mono font-extrabold text-white tracking-[0.2em] shadow-[0_0_15px_rgba(28,77,141,0.3)]">
                      {calculatedRollString}
                    </div>
                  </div>

                  <div className="bg-card/80 backdrop-blur-md border border-border rounded-xl p-4 flex-grow flex flex-col hover:shadow-[0_8px_30px_rgba(28,77,141,0.05)] transition-all">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted mb-3 border-b border-white/5 pb-2">Knowledge Base</h3>
                    <label className={`flex-grow border-2 border-dashed ${answerKey?'border-emerald-500/30 bg-emerald-500/5':'border-white/10 hover:border-primary/50 hover:bg-primary/5 bg-[#151b23]'} rounded-lg p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center`}>
                      <input type="file" accept=".txt" className="sr-only" onChange={(e) => setAnswerKey(e.target.files[0])} />
                      {answerKey ? (
                        <div className="flex flex-col items-center"><CheckCircle className="w-5 h-5 mb-1.5 text-emerald-500" /><span className="text-[10px] font-mono font-bold text-emerald-500 truncate w-full px-2">{answerKey.name}</span></div>
                      ) : (
                        <div className="space-y-1"><UploadCloud className="w-5 h-5 mx-auto text-muted" /><span className="text-[10px] font-bold text-muted uppercase tracking-widest block">Upload Answer Key</span></div>
                      )}
                    </label>
                  </div>
                </motion.div>
              )}

              <div className="flex-grow bg-card/80 backdrop-blur-md border border-border rounded-xl flex flex-col relative overflow-hidden shadow-[0_4px_25px_rgba(0,0,0,0.2)]">
                <AnimatePresence mode="wait">
                  {!results ? (
                    <motion.div key="exec" initial={{opacity:0, scale:0.98}} animate={{opacity:1, scale:1}} exit={{opacity:0}} className="flex flex-col h-full bg-[#0B0F19] items-center justify-center p-8">
                      <label className={`w-full max-w-md border border-dashed ${studentSheet?'border-primary/50 bg-primary/10':'border-white/10 hover:border-primary/30 hover:bg-primary/5 bg-[#151b23]'} rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center mb-6`}>
                        <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => setStudentSheet(e.target.files[0])} />
                        {studentSheet ? (
                          <div className="flex flex-col items-center"><FileText className="w-6 h-6 mb-2 text-primary" /><span className="text-[11px] font-mono font-bold text-primary truncate max-w-full">{studentSheet.name}</span></div>
                        ) : (
                          <div className="space-y-2"><div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-2"><Zap className="w-5 h-5 text-muted" /></div><span className="text-[10px] font-extrabold text-foreground uppercase tracking-widest block">Upload Answer Sheet</span><span className="text-[9px] text-muted font-medium block">PDF, JPG, PNG accepted</span></div>
                        )}
                      </label>

                      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleEvaluate} disabled={loading} className={`w-full max-w-md py-3.5 bg-primary hover:bg-primary-hover text-white text-[11px] font-extrabold tracking-widest uppercase rounded-lg transition-all flex items-center justify-center shadow-[0_0_20px_rgba(28,77,141,0.3)] ${loading ? 'opacity-80 cursor-wait' : ''}`}>
                        {loading ? <span className="animate-pulse">Analyzing Content...</span> : 'Execute Evaluation'}
                      </motion.button>
                    </motion.div>
                  ) : (
                    <motion.div key="res" initial={{opacity:0, scale:0.98}} animate={{opacity:1, scale:1}} className="flex flex-col h-full absolute inset-0">
                      
                      <div className="flex items-center justify-between p-4 border-b border-border bg-[#151b23] shrink-0">
                        <div className="flex items-center space-x-3">
                          <div className="bg-emerald-500/10 p-1.5 rounded-md border border-emerald-500/20"><CheckCircle className="w-4 h-4 text-emerald-400" /></div>
                          <div>
                            <h3 className="text-xs font-bold text-foreground">Subject: {results.subject}</h3>
                            <p className="text-[11px] font-mono text-primary">{results.studentRollNumber}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4 sm:space-x-6">
                          <div className={`px-3 py-1.5 rounded border text-[10px] font-extrabold uppercase tracking-widest ${results.percentage >= 35 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                            {results.percentage >= 35 ? 'PASS' : 'FAIL'}
                          </div>
                          <div className="text-right hidden sm:block">
                            <div className="text-[9px] font-bold text-muted uppercase tracking-widest">Secured</div>
                            <div className="text-sm font-bold text-primary">{results.percentage}%</div>
                          </div>
                          <div className="text-right bg-white/5 px-3 py-1 rounded-md border border-white/5">
                            <div className="text-[9px] font-bold text-muted uppercase tracking-widest">Total Mark</div>
                            <div className="text-lg font-extrabold text-foreground">{results.total_score} <span className="text-xs text-muted font-semibold opacity-70">/ {results.total_possible}</span></div>
                          </div>
                        </div>
                      </div>

                      <div className="flex-grow overflow-y-auto p-4 space-y-3 bg-[#0B0F19]">
                        {results.details.map((item, idx) => (
                          <div key={idx} className="bg-card border border-white/5 rounded-lg p-3 flex flex-row gap-3 hover:border-white/10 transition-colors shadow-sm">
                            <div className="w-12 shrink-0 flex flex-col items-center justify-center bg-[#151b23] rounded-md border border-white/5 py-2">
                              <span className="text-[9px] text-muted font-bold tracking-widest">Q{item.question}</span>
                              <span className="text-[11px] font-extrabold text-white mt-1">{item.awarded}</span>
                            </div>
                            <div className="flex-grow min-w-0 flex flex-col justify-center">
                              <p className="text-[9px] font-bold uppercase tracking-widest text-primary mb-1 flex justify-between"><span>OCR Output</span><span className="text-emerald-400">{(item.similarity*100).toFixed(0)}% Match</span></p>
                              <div className="text-[10px] font-mono text-muted bg-[#151b23] rounded p-2 overflow-y-auto max-h-16 leading-relaxed border border-white/5">
                                {item.student_text}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="p-3 border-t border-border bg-[#151b23] shrink-0 flex items-center justify-between">
                        <button onClick={resetEval} className="text-[10px] font-bold text-muted hover:text-white transition-colors flex items-center uppercase tracking-widest px-2 py-1"><RefreshCw className="w-3 h-3 mr-1.5" /> Back</button>
                        <div className="flex items-center space-x-3">
                          {saveMessage && <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">{saveMessage}</span>}
                          {!isViewingHistory && (
                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleSaveResult} disabled={loading} className="px-5 py-2 bg-foreground hover:bg-gray-200 text-background text-[10px] font-extrabold uppercase tracking-widest rounded transition-colors flex items-center disabled:opacity-50">
                              <Save className="w-3 h-3 mr-1.5" /> save to database
                            </motion.button>
                          )}
                        </div>
                      </div>

                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
