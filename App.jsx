import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  getDocs, 
  writeBatch 
} from "firebase/firestore";
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from "firebase/auth";
import { 
  Lock, Unlock, Check, Edit2, Search, ChevronRight, Users, 
  LayoutDashboard, Download, X, ListPlus, Info, AlertCircle, 
  Save, Calendar, Clock, Trash2, Tag, ChevronDown 
} from 'lucide-react';

// ==========================================================
// 1. FIREBASE CONFIGURATION (Reflected from your request)
// ==========================================================
const firebaseConfig = {
  apiKey: "AIzaSyD15uPHwKG-0ZK8M2fecJ3VimZtvpjmXV8",
  authDomain: "laforet-schedule.firebaseapp.com",
  projectId: "laforet-schedule",
  storageBucket: "laforet-schedule.firebasestorage.app",
  messagingSenderId: "345120055411",
  appId: "1:345120055411:web:75b58579e65a5a631bca06"
};

// Application ID to identify your data path in Firestore
const appId = "laforet-schedule-v1"; 
// ==========================================================

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const App = () => {
  // --- States ---
  const [user, setUser] = useState(null);
  const [view, setView] = useState('form'); 
  const [adminTab, setAdminTab] = useState('summary'); 
  const [name, setName] = useState('');
  const [selectedDays, setSelectedDays] = useState([]); 
  const [filteredNames, setFilteredNames] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dayFilter, setDayFilter] = useState(null); 
  const [staffList, setStaffList] = useState([]);
  const [allSchedules, setAllSchedules] = useState([]);
  
  // Period States
  const [targetWeek, setTargetWeek] = useState(''); 
  const [targetMonth, setTargetMonth] = useState('January');
  const [startDay, setStartDay] = useState('');
  const [endDay, setEndDay] = useState('');
  
  // Admin States
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [newStaffInput, setNewStaffInput] = useState('');
  const [editingStaffName, setEditingStaffName] = useState(null);
  const [editInput, setEditInput] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });

  const weekDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const showMessage = useCallback((msg, type = 'info') => {
    setToast({ show: true, message: msg, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'info' }), 3000);
  }, []);

  // --- Auth & Real-time Data Sync ---
  useEffect(() => {
    // Initial Anonymous Sign-in
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();
    
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Sync Staff List
    const unsubStaff = onSnapshot(
      collection(db, 'artifacts', appId, 'public', 'data', 'staff'),
      (snap) => setStaffList(snap.docs.map(d => d.data().name).sort())
    );

    // Sync Submitted Schedules
    const unsubSchedules = onSnapshot(
      collection(db, 'artifacts', appId, 'public', 'data', 'schedules'),
      (snap) => setAllSchedules(snap.docs.map(d => d.data()))
    );

    // Sync Global Scheduling Settings
    const unsubSettings = onSnapshot(
      doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'scheduling'),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setTargetWeek(d.targetWeek || '');
          setTargetMonth(d.targetMonth || 'January');
          setStartDay(d.startDay || '');
          setEndDay(d.endDay || '');
        }
      }
    );

    return () => { unsubStaff(); unsubSchedules(); unsubSettings(); };
  }, [user]);

  // --- Core Functions ---
  const handleFinalConfirm = async () => {
    if (!user) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'schedules', name);
      await setDoc(docRef, {
        name,
        days: selectedDays,
        targetWeek,
        timestamp: new Date().toLocaleString()
      });
      showMessage('Submission successful.', 'success');
      setView('form');
      setName('');
      setSelectedDays([]);
    } catch (e) {
      showMessage('Cloud save failed.', 'error');
    }
  };

  const updatePeriodData = async (m, s, e) => {
    if (!user || !isAdmin) return;
    const formattedWeek = `${m} ${s} - ${e}`;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'scheduling');
      await setDoc(docRef, { 
        targetWeek: formattedWeek,
        targetMonth: m,
        startDay: s,
        endDay: e
      }, { merge: true });
      showMessage('Period updated globally.', 'success');
    } catch (err) {
      showMessage('Update failed.', 'error');
    }
  };

  const resetAllSchedules = async () => {
    if (!user || !isAdmin || !window.confirm("Delete ALL current submissions?")) return;
    try {
      const batch = writeBatch(db);
      const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'schedules'));
      snap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      showMessage('All data cleared.', 'info');
    } catch (e) {
      showMessage('Reset failed.', 'error');
    }
  };

  const addStaffMembers = async () => {
    if (!user || !isAdmin) return;
    const names = newStaffInput.split('\n').map(n => n.trim()).filter(n => n && !staffList.includes(n));
    if (!names.length) return showMessage('No new names found.', 'error');
    try {
      const batch = writeBatch(db);
      names.forEach(n => {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'staff', n);
        batch.set(docRef, { name: n });
      });
      await batch.commit();
      setNewStaffInput('');
      showMessage(`${names.length} members added.`, 'success');
    } catch (e) {
      showMessage('Error adding staff.', 'error');
    }
  };

  const removeStaff = async (target) => {
    if (!user || !isAdmin || !window.confirm(`Remove ${target}?`)) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'staff', target));
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', target));
      await batch.commit();
      showMessage('Staff removed.', 'info');
    } catch (e) {
      showMessage('Delete failed.', 'error');
    }
  };

  const saveEdit = async (oldName) => {
    if (!user || !isAdmin) return;
    const newName = editInput.trim();
    if (!newName || newName === oldName) return setEditingStaffName(null);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'staff', newName), { name: newName });
      const oldS = allSchedules.find(s => s.name === oldName);
      if (oldS) {
        batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', newName), { ...oldS, name: newName });
      }
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'staff', oldName));
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', oldName));
      await batch.commit();
      setEditingStaffName(null);
      showMessage('Rename successful.', 'success');
    } catch (e) {
      showMessage('Rename failed.', 'error');
    }
  };

  const handleNameChange = (e) => {
    const val = e.target.value;
    setName(val);
    if (val.length > 0) {
      setFilteredNames(staffList.filter(n => n.toLowerCase().includes(val.toLowerCase())));
      setShowDropdown(true);
    } else setShowDropdown(false);
  };

  const toggleDay = (idx) => {
    setSelectedDays(prev => prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx].sort());
  };

  const downloadCSV = () => {
    let csv = "\uFEFFName," + weekDays.join(",") + ",Last Updated\n";
    staffList.forEach(sn => {
      const s = allSchedules.find(sc => sc.name === sn);
      const row = [sn, ...weekDays.map((_, i) => s?.days.includes(i) ? "O" : "-"), s ? s.timestamp : "No Data"];
      csv += row.join(",") + "\n";
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `FOH_Schedule_${targetWeek.replace(/\s+/g, '_')}.csv`;
    link.click();
  };

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center font-black uppercase text-xs flex-col gap-4">
      <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
      Connecting to Cloud...
    </div>
  );

  return (
    <div className="min-h-screen bg-white text-black font-sans p-4 sm:p-12 transition-all">
      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] border-2 border-black bg-white px-6 py-4 shadow-[8px_8px_0px_rgba(0,0,0,1)] animate-in slide-in-from-top-4 duration-300">
          <span className="font-black uppercase text-xs tracking-widest">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="max-w-4xl mx-auto flex justify-between items-start mb-8 sm:mb-12">
        <header className="border-b-4 border-black pb-4 flex-1">
          <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tighter italic">FOH Scheduler</h1>
          <div className="flex flex-wrap items-center gap-4 mt-2">
            <p className="text-[10px] font-bold uppercase opacity-50 tracking-[0.3em]">
              {view === 'admin' ? 'Master Administration' : 'Availability Entry System'}
            </p>
            {targetWeek && (
              <div className="bg-black text-white px-2 py-1 text-[10px] font-black uppercase tracking-widest">
                Target: {targetWeek}
              </div>
            )}
          </div>
        </header>
        <button 
          onClick={() => !isAdmin ? setShowAdminLogin(true) : setIsAdmin(!isAdmin)} 
          className="ml-6 p-3 border-2 border-black hover:bg-black hover:text-white transition-all shadow-sm"
        >
          {isAdmin ? <Unlock size={20} /> : <Lock size={20} />}
        </button>
      </div>

      <main className="max-w-4xl mx-auto">
        {/* VIEW: ENTRY FORM */}
        {view === 'form' && (
          <div className="max-w-xl mx-auto space-y-12 animate-in fade-in duration-500">
            <div className="bg-gray-50 border-2 border-black p-6 shadow-inner">
              <p className="text-2xl font-black uppercase tracking-tight">
                {targetWeek ? `For: ${targetWeek}` : 'Next Available Week'}
              </p>
            </div>
            
            <section>
              <h2 className="text-xs font-black uppercase mb-4 flex items-center gap-2 text-black/60">
                <span className="bg-black text-white px-2 py-0.5">01</span> Identification
              </h2>
              <div className="relative">
                <div className="flex items-center border-2 border-black p-4 focus-within:ring-2 ring-black">
                  <Search size={20} className="mr-3 opacity-30" />
                  <input 
                    type="text" 
                    value={name} 
                    onChange={handleNameChange} 
                    placeholder="Search your name..." 
                    className="w-full focus:outline-none font-bold uppercase text-lg bg-transparent" 
                  />
                </div>
                {showDropdown && filteredNames.length > 0 && (
                  <ul className="absolute z-20 w-full bg-white border-2 border-t-0 border-black shadow-2xl max-h-60 overflow-y-auto">
                    {filteredNames.map(n => (
                      <li 
                        key={n} 
                        onClick={() => {setName(n); setShowDropdown(false);}} 
                        className="p-4 hover:bg-black hover:text-white cursor-pointer font-bold border-b border-gray-100 last:border-0 uppercase"
                      >
                        {n}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section>
              <h2 className="text-xs font-black uppercase mb-4 flex items-center gap-2 text-black/60">
                <span className="bg-black text-white px-2 py-0.5">02</span> Work Availability
              </h2>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {weekDays.map((day, idx) => {
                  const isActive = selectedDays.includes(idx);
                  return (
                    <button 
                      key={day} 
                      onClick={() => toggleDay(idx)} 
                      className={`py-6 border-2 border-black font-black text-xs sm:text-sm transition-all ${isActive ? 'bg-black text-white shadow-md transform scale-105' : 'bg-white hover:bg-gray-100'}`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </section>

            <button 
              onClick={() => name && selectedDays.length > 0 ? setView('summary') : showMessage('Fill all fields', 'error')} 
              className="w-full bg-black text-white py-6 font-black uppercase tracking-[0.2em] hover:opacity-80 transition-all flex items-center justify-center gap-2 text-lg shadow-xl"
            >
              Verify Submission <ChevronRight size={24} />
            </button>
          </div>
        )}

        {/* VIEW: SUMMARY */}
        {view === 'summary' && (
          <div className="max-w-xl mx-auto space-y-8 animate-in slide-in-from-bottom-4">
            <div className="border-4 border-black p-10 bg-gray-50 shadow-md relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5"><Check size={120} /></div>
              <h2 className="text-[10px] font-black uppercase mb-8 border-b-2 border-black inline-block text-black/40">Review Entry</h2>
              <div className="mb-8">
                <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest underline decoration-2 decoration-black/10">Staff Member</p>
                <p className="text-4xl font-black uppercase">{name}</p>
              </div>
              <div className="mb-8">
                <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest underline decoration-2 decoration-black/10">Requested Period</p>
                <p className="text-xl font-black uppercase">{targetWeek || 'Unspecified'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold opacity-40 uppercase mb-4 tracking-widest underline decoration-2 decoration-black/10">Availability</p>
                <div className="flex flex-wrap gap-2">
                  {weekDays.map((day, idx) => selectedDays.includes(idx) && (
                    <span key={day} className="px-4 py-2 bg-black text-white text-xs font-black tracking-widest">
                      {day}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setView('form')} className="border-2 border-black py-4 font-black uppercase text-sm hover:bg-gray-100 transition-all">Go Back</button>
              <button onClick={handleFinalConfirm} className="bg-black text-white py-4 font-black uppercase text-sm hover:opacity-80 shadow-lg transition-all">Submit to Cloud</button>
            </div>
          </div>
        )}

        {/* VIEW: ADMIN PANEL */}
        {view === 'admin' && isAdmin && (
          <div className="space-y-8 animate-in fade-in">
            {/* Tabs */}
            <div className="flex border-b-2 border-black overflow-x-auto scrollbar-hide">
              <button onClick={() => setAdminTab('summary')} className={`px-6 py-4 font-black text-xs uppercase whitespace-nowrap transition-all ${adminTab === 'summary' ? 'bg-black text-white' : 'hover:bg-gray-100'}`}>Dashboard</button>
              <button onClick={() => setAdminTab('staff')} className={`px-6 py-4 font-black text-xs uppercase whitespace-nowrap transition-all ${adminTab === 'staff' ? 'bg-black text-white' : 'hover:bg-gray-100'}`}>Staff Management</button>
            </div>

            {/* TAB: DASHBOARD */}
            {adminTab === 'summary' && (
              <div className="space-y-8">
                <section className="border-4 border-black p-6 bg-gray-50 flex flex-col gap-6 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
                  <div className="w-full">
                    <h4 className="text-xs font-black uppercase mb-4 flex items-center gap-2"><Tag size={16}/> Target Schedule Period Configuration</h4>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] font-bold uppercase opacity-50">Month Selection</label>
                        <div className="relative">
                          <select 
                            value={targetMonth}
                            onChange={(e) => {setTargetMonth(e.target.value); updatePeriodData(e.target.value, startDay, endDay);}}
                            className="appearance-none border-2 border-black p-3 pr-10 font-bold uppercase text-sm focus:outline-none bg-white min-w-[140px] cursor-pointer"
                          >
                            {months.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] font-bold uppercase opacity-50">Start Date</label>
                        <input type="number" value={startDay} onChange={(e) => {setStartDay(e.target.value); updatePeriodData(targetMonth, e.target.value, endDay);}} placeholder="DD" className="w-20 border-2 border-black p-3 font-bold uppercase text-sm focus:outline-none bg-white text-center" />
                      </div>
                      <div className="p-3 font-black">~</div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] font-bold uppercase opacity-50">End Date</label>
                        <input type="number" value={endDay} onChange={(e) => {setEndDay(e.target.value); updatePeriodData(targetMonth, startDay, e.target.value);}} placeholder="DD" className="w-20 border-2 border-black p-3 font-bold uppercase text-sm focus:outline-none bg-white text-center" />
                      </div>

                      <div className="ml-auto flex flex-wrap gap-2">
                        <button onClick={downloadCSV} className="bg-black text-white px-6 py-3 font-black text-xs uppercase shadow-sm flex items-center gap-2 hover:opacity-80 transition-all">
                          <Download size={16} /> Export CSV
                        </button>
                        <button onClick={resetAllSchedules} className="border-2 border-red-600 text-red-600 px-6 py-3 font-black text-xs uppercase hover:bg-red-600 hover:text-white transition-all flex items-center justify-center gap-2">
                          <Trash2 size={16} /> Reset Data
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="space-y-4">
                  <h3 className="text-lg font-black uppercase border-l-8 border-black pl-3">Live Matrix</h3>
                  <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide">
                    <button onClick={() => setDayFilter(null)} className={`px-4 py-2 text-[10px] border-2 border-black font-black whitespace-nowrap transition-all ${dayFilter === null ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'}`}>ALL STAFF</button>
                    {weekDays.map((d, i) => <button key={d} onClick={() => setDayFilter(i)} className={`px-4 py-2 text-[10px] border-2 border-black font-black whitespace-nowrap transition-all ${dayFilter === i ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'}`}>{d}</button>)}
                  </div>
                </div>
                
                <div className="overflow-x-auto border-2 border-black shadow-lg bg-white relative">
                  <table className="w-full text-left min-w-[700px] border-collapse">
                    <thead className="bg-black text-white text-[10px] font-black">
                      <tr>
                        <th className="p-4 sticky left-0 bg-black z-10 border-r border-white/10 uppercase tracking-widest">Name</th>
                        {weekDays.map(d => <th key={d} className="p-4 text-center border-r border-white/10">{d}</th>)}
                      </tr>
                    </thead>
                    <tbody className="text-xs font-black uppercase">
                      {staffList.filter(sn => dayFilter === null || allSchedules.find(sc => sc.name === sn)?.days.includes(dayFilter)).map(sName => {
                        const s = allSchedules.find(sc => sc.name === sName);
                        return (
                          <tr key={sName} className="border-b border-black hover:bg-gray-50 transition-colors group">
                            <td className="p-4 border-r border-black sticky left-0 bg-white group-hover:bg-gray-50 z-10 font-black">{sName}</td>
                            {weekDays.map((_, i) => (
                              <td key={i} className={`p-4 text-center border-r border-black last:border-0 ${dayFilter === i ? 'bg-gray-100/30' : ''}`}>
                                <div className={`mx-auto w-5 h-5 rounded-sm ${s?.days.includes(i) ? 'bg-black shadow-md' : 'border border-black/10 bg-gray-50'}`} />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: STAFF LIST */}
            {adminTab === 'staff' && (
              <div className="max-w-2xl space-y-12 animate-in fade-in">
                <section className="border-4 border-black p-8 bg-white shadow-[8px_8px_0px_rgba(0,0,0,1)]">
                  <h3 className="text-lg font-black uppercase mb-4 flex items-center gap-2"><ListPlus size={20}/> Bulk Import Staff</h3>
                  <textarea rows={5} value={newStaffInput} onChange={(e) => setNewStaffInput(e.target.value)} placeholder="Jane Doe&#10;John Smith&#10;Alex Kim..." className="w-full border-2 border-black p-4 font-bold uppercase focus:outline-none bg-gray-50 mb-4 focus:bg-white transition-all shadow-inner" />
                  <button onClick={addStaffMembers} className="w-full bg-black text-white py-5 font-black uppercase text-sm hover:opacity-80 shadow-lg transition-all">Import List</button>
                </section>

                <section>
                  <h3 className="text-lg font-black uppercase mb-4 border-b-4 border-black pb-2 flex justify-between items-end">
                    <span>Active Roster ({staffList.length})</span>
                    <span className="text-[8px] opacity-40 font-black tracking-widest uppercase italic">Edit Mode Active</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {staffList.map(sName => (
                      <div key={sName} className="border-2 border-black p-4 flex justify-between items-center bg-white hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] transition-all">
                        {editingStaffName === sName ? (
                          <div className="flex-1 flex gap-2">
                            <input value={editInput} onChange={e => setEditInput(e.target.value)} className="w-full border-2 border-black px-2 py-1 uppercase font-bold text-xs focus:outline-none shadow-inner" autoFocus />
                            <button onClick={() => saveEdit(sName)} className="text-green-600 hover:opacity-50"><Save size={18}/></button>
                            <button onClick={() => setEditingStaffName(null)}><X size={18}/></button>
                          </div>
                        ) : (
                          <span className="font-black text-[11px] uppercase tracking-tight truncate mr-2">{sName}</span>
                        )}
                        <div className="flex gap-3">
                          {editingStaffName !== sName && (
                            <>
                              <button onClick={() => { setEditingStaffName(sName); setEditInput(sName); }} className="text-gray-300 hover:text-black transition-colors"><Edit2 size={16}/></button>
                              <button onClick={() => removeStaff(sName)} className="text-gray-300 hover:text-red-600 transition-colors"><Trash2 size={16}/></button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Admin Login Modal */}
      {showAdminLogin && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white p-8 sm:p-12 w-full max-w-sm border-4 border-black shadow-[16px_16px_0px_rgba(0,0,0,0.3)] animate-in zoom-in-95">
            <h3 className="text-2xl font-black uppercase mb-8 text-center tracking-widest text-black">Admin Access</h3>
            <input type="password" placeholder="••••" className="w-full border-2 border-black p-4 mb-8 text-center text-4xl tracking-[0.5em] focus:outline-none font-black bg-gray-50 focus:bg-white transition-all shadow-inner" value={password} onChange={e => setPassword(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && (password === '1234' ? (setIsAdmin(true), setShowAdminLogin(false), setPassword(''), setView('admin'), showMessage('Access Granted', 'success')) : showMessage('Incorrect Key', 'error'))} autoFocus />
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => password === '1234' ? (setIsAdmin(true), setShowAdminLogin(false), setPassword(''), setView('admin'), showMessage('Access Granted', 'success')) : showMessage('Incorrect Key', 'error')} className="bg-black text-white py-4 font-black uppercase text-xs tracking-widest hover:opacity-80 transition-all shadow-md">Unlock</button>
              <button onClick={() => setShowAdminLogin(false)} className="border-2 border-black py-4 font-black uppercase text-xs tracking-widest hover:bg-gray-100 transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-40 text-center border-t-4 border-black/5 pt-8">
        <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.6em] opacity-20">La Forêt // Personnel Scheduling System v10.0</p>
      </footer>
    </div>
  );
};

export default App;
