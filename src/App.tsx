import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Heart, 
  MapPin, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  Users, 
  Lock,
  Trash2,
  Phone
} from 'lucide-react';
import { db, auth } from './firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  onSnapshot,
  getDocFromServer,
  doc,
  deleteDoc
} from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { clsx, type ClassValue } from 'clsx';

// --- Types ---
interface RSVP {
  id?: string;
  firstName: string;
  lastName: string;
  guestsCount: number;
  createdAt: string;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false, error: null };
  public props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Pati një gabim të papritur.";
      try {
        const parsed = JSON.parse(this.state.error?.message || "{}");
        if (parsed.error) {
          errorMessage = `Gabim në Firestore: ${parsed.error}`;
        }
      } catch (e) {
        // Not a JSON error
      }
      return (
        <div className="min-h-screen bg-sand-900 flex items-center justify-center p-4 text-center">
          <div className="bg-sand-800 p-12 rounded-sm border border-sand-700 max-w-lg w-full space-y-6 shadow-2xl">
            <Lock className="mx-auto text-red-400" size={64} />
            <h2 className="text-3xl font-serif text-sand-50">Ups! Diçka shkoi gabim.</h2>
            <p className="text-sand-300">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-sand-100 text-sand-900 px-8 py-3 rounded-sm font-bold uppercase tracking-widest hover:bg-white transition-all"
            >
              Rifresko Faqen
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Components ---

export default function App() {
  return (
    <ErrorBoundary>
      <WeddingApp />
    </ErrorBoundary>
  );
}

function WeddingApp() {
  const [formData, setFormData] = useState({ firstName: '', lastName: '', guestsCount: 1 });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [pin, setPin] = useState('');
  const [rsvps, setRsvps] = useState<RSVP[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    if (showAdmin && user && user.email === 'ukajgentonis88@gmail.com' && user.emailVerified) {
      const q = query(collection(db, 'rsvps'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RSVP));
        setRsvps(data);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'rsvps');
      });
      return () => unsubscribe();
    }
  }, [showAdmin, user]);

  const RSVP_DEADLINE = new Date('2026-07-16T00:00:00'); // Deadline is end of July 15th
  const isPastDeadline = new Date() > RSVP_DEADLINE;

  const handleRSVP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPastDeadline) {
      alert("Afati për konfirmim ka kaluar.");
      return;
    }
    if (formData.guestsCount < 1 || formData.guestsCount > 20) {
      alert("Numri i personave duhet të jetë mes 1 dhe 20.");
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await addDoc(collection(db, 'rsvps'), {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        guestsCount: formData.guestsCount,
        createdAt: new Date().toISOString()
      });
      setIsSubmitted(true);
      setFormData({ firstName: '', lastName: '', guestsCount: 1 });
    } catch (error: any) {
      console.error("RSVP submission failed", error);
      setSubmitError("Pati një problem gjatë dërgimit. Ju lutem provoni përsëri.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdminLogin = async () => {
    if (pin === '2003') {
      try {
        let currentUser = user;
        if (!currentUser) {
          const provider = new GoogleAuthProvider();
          const result = await signInWithPopup(auth, provider);
          currentUser = result.user;
        }
        
        // Explicitly check if the logged in user is the organizer
        if (currentUser?.email === "ukajgentonis88@gmail.com" && currentUser?.emailVerified) {
          setShowAdmin(true);
        } else {
          alert("Vetëm organizatori ka autorizim për të hyrë në këtë panel.");
          await auth.signOut();
        }
      } catch (error: any) {
        if (error.code !== 'auth/popup-closed-by-user') {
          alert("Dështoi identifikimi. Ju lutem provoni përsëri.");
        }
        console.error("Login failed", error);
      }
    } else {
      alert("PIN i gabuar!");
    }
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDeleteRSVP = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      // Reset after 3 seconds
      setTimeout(() => setConfirmDeleteId(null), 3000);
      return;
    }
    
    try {
      await deleteDoc(doc(db, 'rsvps', id));
      setConfirmDeleteId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `rsvps/${id}`);
    }
  };

  return (
    <div className="min-h-screen bg-sand-100 text-sand-900 font-sans selection:bg-sand-200 overflow-x-hidden">
      {/* Background Texture */}
      <div className="fixed inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/paper.png")' }} />

      {/* Hero Section - Full Bleed */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-4 py-20 overflow-hidden">
        {/* Full Background Image */}
        <div className="absolute inset-0 -z-10">
          <img 
            src="https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&q=80&w=2000" 
            alt="Floral Background" 
            className="w-full h-full object-cover opacity-30"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-sand-50/40" />
        </div>

        <div className="max-w-4xl w-full flex flex-col items-center">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="space-y-6 relative py-20"
          >
            <h2 className="text-sm uppercase tracking-[0.6em] text-sand-500 font-medium">Ftesë Dasme</h2>
            <h1 className="text-7xl md:text-9xl font-serif text-sand-800 leading-tight">Miran & Mahie</h1>
            <div className="w-32 h-px bg-sand-300 mx-auto my-8" />
            <div className="space-y-4">
              <p className="text-4xl md:text-5xl font-serif italic text-sand-700">01.08.2026</p>
              <div className="flex flex-col items-center space-y-2 text-sand-600">
                <div className="flex items-center space-x-3">
                  <MapPin size={24} className="text-sand-400" />
                  <span className="text-2xl tracking-wide">Antika Garden 2</span>
                </div>
                <span className="text-sand-400 uppercase tracking-widest text-sm">Pejë - Raushiq</span>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div 
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 2.5 }}
          className="absolute bottom-12 text-sand-300"
        >
          <div className="w-px h-16 bg-sand-200 mx-auto" />
        </motion.div>
      </section>

      {/* Quote Section */}
      <section className="py-32 px-4 bg-sand-100">
        <div className="max-w-4xl mx-auto text-center space-y-12">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="flex flex-col items-center space-y-10"
          >
            <Heart className="text-sand-300 fill-sand-300/20" size={56} />
            <p className="text-3xl md:text-5xl font-serif leading-relaxed text-sand-800 italic max-w-3xl">
              "Dashuria është fillimi i një rruge të gjatë, plot lumturi dhe mirëkuptim. 
              Sot, ne bashkojmë zemrat tona për të nisur këtë udhëtim të mrekullueshëm së bashku."
            </p>
            <div className="w-24 h-px bg-sand-200" />
          </motion.div>
        </div>
      </section>

      {/* Ceremony Section */}
      <section className="py-32 px-4 bg-sand-50 border-y border-sand-200">
        <div className="max-w-4xl mx-auto text-center space-y-12">
          <div className="space-y-8">
            <Calendar className="text-sand-400 mx-auto" size={48} />
            <h3 className="text-5xl font-serif text-sand-800">Ceremonia</h3>
            <div className="space-y-6">
              <p className="text-2xl text-sand-700 font-light tracking-wide">E Shtunë, 01 Gusht 2026</p>
              <div className="flex items-center justify-center space-x-3 text-sand-500 text-xl">
                <Clock size={24} />
                <span>Ora 19:00</span>
              </div>
              <p className="text-sand-500 max-w-lg mx-auto">
                Ju mirëpresim të festojmë së bashku këtë natë të veçantë në ambientet e Antika Garden 2.
              </p>
            </div>
            <div className="pt-8">
              <a 
                href="https://maps.app.goo.gl/dNjrCuGuWM9bbD6T7" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-4 bg-sand-800 text-white px-10 py-5 rounded-sm hover:bg-sand-900 transition-all shadow-xl group"
              >
                <MapPin size={20} className="group-hover:scale-110 transition-transform" />
                <span className="font-medium tracking-widest uppercase text-sm">Hap në Google Maps</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Agenda Section */}
      <section className="py-32 px-4 bg-sand-100">
        <div className="max-w-4xl mx-auto space-y-20">
          <div className="text-center space-y-4">
            <h3 className="text-5xl font-serif text-sand-800">Agjenda e Mbrëmjes</h3>
            <div className="w-16 h-px bg-sand-300 mx-auto" />
          </div>
          <div className="grid grid-cols-1 gap-12">
            {[
              { time: '19:00 - 20:00', label: 'Pritja e mysafirëve', desc: '' },
            ].map((item, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="flex gap-10 items-center p-8 bg-white/50 border border-sand-200 rounded-sm hover:bg-white transition-colors group"
              >
                <div className="font-mono text-xl text-sand-400 w-40 shrink-0 border-r border-sand-200 pr-8">{item.time}</div>
                <div className="space-y-1">
                  <h4 className="text-2xl font-serif text-sand-800">{item.label}</h4>
                  {item.desc && <p className="text-sand-500">{item.desc}</p>}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* RSVP Section */}
      <section id="rsvp" className="py-32 px-4 bg-sand-800 text-sand-50">
        <div className="max-w-4xl mx-auto">
          {!showAdmin ? (
            <div className="space-y-16">
              <div className="text-center space-y-6">
                <h3 className="text-6xl font-serif">Konfirmimi</h3>
                <p className="text-sand-300 italic text-xl">Ju lutem konfirmoni pjesëmarrjen tuaj deri më 15 Korrik</p>
                <div className="w-20 h-px bg-sand-600 mx-auto" />
              </div>

              {isPastDeadline ? (
                <div className="bg-sand-900/50 p-16 rounded-sm text-center space-y-8 border border-sand-700">
                  <Clock className="mx-auto text-sand-400" size={72} />
                  <div className="space-y-4">
                    <p className="text-4xl font-serif">Afati ka kaluar</p>
                    <p className="text-sand-300 text-lg">Më vjen keq, por afati për konfirmim ka përfunduar më 15 Korrik.</p>
                  </div>
                </div>
              ) : isSubmitted ? (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-sand-900/50 p-16 rounded-sm text-center space-y-8 border border-sand-700"
                >
                  <CheckCircle2 className="mx-auto text-sand-200" size={72} />
                  <div className="space-y-4">
                    <p className="text-4xl font-serif">Faleminderit!</p>
                    <p className="text-sand-300 text-lg">Konfirmimi juaj u dërgua me sukses.</p>
                  </div>
                  <button 
                    onClick={() => setIsSubmitted(false)}
                    className="text-sm text-sand-400 uppercase tracking-widest hover:text-sand-200 transition-colors"
                  >
                    Dërgo një tjetër konfirmim
                  </button>
                </motion.div>
              ) : (
                <form onSubmit={handleRSVP} className="space-y-10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-4">
                      <label className="text-xs uppercase tracking-[0.3em] text-sand-400 font-bold">Emri</label>
                      <input 
                        required
                        type="text"
                        value={formData.firstName}
                        onChange={e => setFormData({...formData, firstName: e.target.value})}
                        className="w-full bg-sand-900/50 border border-sand-700 p-5 rounded-sm focus:outline-none focus:border-sand-400 transition-all text-xl"
                        placeholder="Emri juaj"
                      />
                    </div>
                    <div className="space-y-4">
                      <label className="text-xs uppercase tracking-[0.3em] text-sand-400 font-bold">Mbiemri</label>
                      <input 
                        required
                        type="text"
                        value={formData.lastName}
                        onChange={e => setFormData({...formData, lastName: e.target.value})}
                        className="w-full bg-sand-900/50 border border-sand-700 p-5 rounded-sm focus:outline-none focus:border-sand-400 transition-all text-xl"
                        placeholder="Mbiemri juaj"
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className="text-xs uppercase tracking-[0.3em] text-sand-400 font-bold">Numri i personave</label>
                    <div className="relative">
                      <Users className="absolute left-5 top-1/2 -translate-y-1/2 text-sand-600" size={24} />
                      <input 
                        required
                        type="number"
                        min="1"
                        max="20"
                        value={formData.guestsCount || ''}
                        onChange={e => {
                          const val = parseInt(e.target.value);
                          if (isNaN(val)) {
                            setFormData({...formData, guestsCount: 0});
                          } else {
                            setFormData({...formData, guestsCount: val});
                          }
                        }}
                        className="w-full bg-sand-900/50 border border-sand-700 p-5 pl-16 rounded-sm focus:outline-none focus:border-sand-400 transition-all text-xl"
                      />
                    </div>
                  </div>
                  {submitError && (
                    <p className="text-red-400 text-sm font-medium text-center">{submitError}</p>
                  )}
                  <button 
                    disabled={isSubmitting}
                    className="w-full bg-sand-100 text-sand-900 p-6 rounded-sm font-bold text-xl hover:bg-white transition-all shadow-2xl disabled:opacity-50 active:scale-[0.99] uppercase tracking-widest"
                  >
                    {isSubmitting ? 'Duke u dërguar...' : 'Konfirmo Pjesëmarrjen'}
                  </button>
                </form>
              )}

              <div className="pt-20 border-t border-sand-700 flex flex-col items-center space-y-8">
                <div className="flex flex-col items-center space-y-4">
                  <div className="flex items-center space-x-4 bg-sand-900/30 p-3 rounded-sm border border-sand-700">
                    <Lock size={16} className="text-sand-600 ml-2" />
                    <input 
                      type="password" 
                      placeholder="PIN"
                      value={pin}
                      onChange={e => setPin(e.target.value)}
                      className="w-28 text-center bg-transparent focus:outline-none text-lg font-mono text-sand-200"
                    />
                    <button 
                      onClick={handleAdminLogin}
                      className="bg-sand-700 text-sand-100 px-6 py-2 rounded-sm text-sm font-bold hover:bg-sand-600 transition-colors"
                    >
                      Hyr
                    </button>
                  </div>
                  <p className="text-[10px] text-sand-500 uppercase tracking-[0.4em]">Vetëm për organizatorët</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full space-y-12">
              <div className="flex items-center justify-between border-b border-sand-700 pb-8">
                <div className="space-y-2">
                  <h3 className="text-4xl font-serif">Lista e Mysafirëve</h3>
                  <p className="text-sand-400 uppercase tracking-widest text-sm">Gjithsej: {rsvps.reduce((acc, curr) => acc + curr.guestsCount, 0)} persona</p>
                </div>
                <button 
                  onClick={() => setShowAdmin(false)} 
                  className="bg-sand-700 text-sand-100 px-6 py-3 rounded-sm text-sm font-bold hover:bg-sand-600 transition-colors"
                >
                  Mbyll Panelin
                </button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-sand-500 uppercase text-xs tracking-[0.3em] font-bold">
                    <tr>
                      <th className="py-6 px-4">Emri & Mbiemri</th>
                      <th className="py-6 px-4 text-center">Pers.</th>
                      <th className="py-6 px-4 text-right">Veprime</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand-700">
                    {rsvps.map((rsvp) => (
                      <tr key={rsvp.id} className="hover:bg-sand-900/30 transition-colors group">
                        <td className="py-6 px-4">
                          <div className="text-xl font-serif">{rsvp.firstName} {rsvp.lastName}</div>
                          <div className="text-xs text-sand-500 font-mono mt-1">
                            {new Date(rsvp.createdAt).toLocaleDateString('sq-AL')}
                          </div>
                        </td>
                        <td className="py-6 px-4 text-center">
                          <span className="bg-sand-700 text-sand-100 px-3 py-1 rounded-sm text-sm font-bold">{rsvp.guestsCount}</span>
                        </td>
                        <td className="py-6 px-4 text-right">
                          <button 
                            onClick={() => rsvp.id && handleDeleteRSVP(rsvp.id)}
                            className={clsx(
                              "p-3 transition-all rounded-sm font-bold text-xs uppercase tracking-widest",
                              confirmDeleteId === rsvp.id 
                                ? "bg-red-500 text-white" 
                                : "text-sand-600 hover:text-red-400"
                            )}
                            title={confirmDeleteId === rsvp.id ? "Konfirmo fshirjen" : "Fshi"}
                          >
                            {confirmDeleteId === rsvp.id ? 'Konfirmo?' : <Trash2 size={20} />}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {rsvps.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-20 text-center text-sand-500 italic text-2xl font-serif">Asnjë konfirmim ende</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-32 bg-sand-50 text-center space-y-12 border-t border-sand-200">
        <div className="max-w-4xl mx-auto space-y-12">
          <div className="w-20 h-px bg-sand-300 mx-auto" />
          <div className="space-y-8">
            <div className="flex flex-col items-center space-y-4">
              <span className="text-xs uppercase tracking-[0.4em] text-sand-400 font-bold">Për çdo pyetje na kontaktoni</span>
              <div className="flex flex-col md:flex-row items-center justify-center gap-4">
                <div className="flex items-center space-x-4 text-sand-800 bg-white px-10 py-5 rounded-sm shadow-xl border border-sand-200 w-full md:w-auto">
                  <Phone size={20} className="text-sand-400" />
                  <a href="tel:044964299" className="text-2xl font-serif hover:text-sand-600 transition-colors">044 964 299</a>
                </div>
                <div className="flex items-center space-x-4 text-sand-800 bg-white px-10 py-5 rounded-sm shadow-xl border border-sand-200 w-full md:w-auto">
                  <Phone size={20} className="text-sand-400" />
                  <a href="tel:+41762137980" className="text-2xl font-serif hover:text-sand-600 transition-colors">+41 76 213 79 80</a>
                </div>
              </div>
            </div>
          </div>
          <div className="pt-12">
            <p className="text-xs uppercase tracking-[0.8em] text-sand-300 font-medium">Miran & Mahie • 2026</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
