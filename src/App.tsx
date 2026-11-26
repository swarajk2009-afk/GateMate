import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import {
  Shield,
  Users,
  CreditCard,
  Wrench,
  Bell,
  Clock,
  LogOut,
  KeyRound,
  Plus,
  AlertTriangle,
  Building2,
  Pencil,
  Check,
  X,
  Camera,
} from 'lucide-react';

// Compresses captured phone photo to ~35 KB JPEG so DB storage stays tiny & fast
function compressImage(file, maxWidth = 480, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Editable Apartment Name state
  const [apartmentName, setApartmentName] = useState('GateMate');
  const [tagline, setTagline] = useState('Smart Society Portal');
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    fetchSocietySettings();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user);
      else setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchSocietySettings() {
    const { data } = await supabase
      .from('society_settings')
      .select('apartment_name, tagline')
      .eq('id', 1)
      .maybeSingle();

    if (data) {
      setApartmentName(data.apartment_name);
      setTagline(data.tagline);
    }
  }

  async function saveApartmentName(e) {
    e.preventDefault();
    if (!draftName.trim()) return;
    setSavingName(true);

    const { error } = await supabase
      .from('society_settings')
      .update({
        apartment_name: draftName.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    if (!error) {
      setApartmentName(draftName.trim());
      setIsEditingName(false);
    } else {
      alert('Failed to update apartment name: ' + error.message);
    }
    setSavingName(false);
  }

  async function fetchProfile(user) {
    setLoading(true);
    setErrorMsg('');

    let { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    if (!data) {
      const meta = user.user_metadata || {};
      const { data: created, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          full_name: meta.full_name || user.email.split('@')[0],
          role: meta.role || 'resident',
          flat_number: meta.flat_number || null,
          is_approved: false,
        })
        .select()
        .single();

      if (insertError) {
        setErrorMsg(insertError.message);
        setLoading(false);
        return;
      }
      data = created;
    }

    setProfile(data);
    setLoading(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600">
        Loading {apartmentName}...
      </div>
    );
  }

  if (!session) {
    return <AuthScreen apartmentName={apartmentName} />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 text-center">
        <p className="text-slate-800 font-medium mb-2">
          Could not load user profile.
        </p>
        {errorMsg && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg mb-4 max-w-md">
            Database Error: {errorMsg}
          </p>
        )}
        <div className="flex gap-3">
          <button
            onClick={() => fetchProfile(session.user)}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg"
          >
            Retry
          </button>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 border border-slate-300 text-slate-700 text-sm rounded-lg"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (!profile.is_approved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center">
          <Clock className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            Pending RWA Admin Approval
          </h2>
          <p className="text-sm text-slate-600 mb-6">
            Hi <span className="font-semibold">{profile.full_name}</span>, your
            account (
            <span className="capitalize font-medium">{profile.role}</span>
            {profile.flat_number ? ` • Flat ${profile.flat_number}` : ''}) is
            awaiting verification by the society administrator.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => fetchProfile(session.user)}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
            >
              Check Status
            </button>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-indigo-600 p-2 rounded-lg text-white">
              <Building2 className="w-5 h-5" />
            </div>

            {isEditingName && profile.role === 'admin' ? (
              <form
                onSubmit={saveApartmentName}
                className="flex items-center gap-1.5"
              >
                <input
                  type="text"
                  autoFocus
                  required
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Enter Apartment Name"
                  className="px-2.5 py-1 text-sm font-bold border border-indigo-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44 sm:w-56"
                />
                <button
                  type="submit"
                  disabled={savingName}
                  title="Save"
                  className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingName(false)}
                  title="Cancel"
                  className="p-1.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="font-bold text-lg leading-tight">
                    {apartmentName}
                  </h1>
                  {profile.role === 'admin' && (
                    <button
                      onClick={() => {
                        setDraftName(apartmentName);
                        setIsEditingName(true);
                      }}
                      title="Edit Apartment Name"
                      className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500">{tagline}</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-slate-800">
                {profile.full_name}
              </p>
              <p className="text-xs text-slate-500 capitalize">
                {profile.role}{' '}
                {profile.flat_number ? `• ${profile.flat_number}` : ''}
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:text-red-600 border border-slate-200 rounded-lg hover:bg-red-50 transition"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {profile.role === 'resident' && <ResidentDashboard profile={profile} />}
        {profile.role === 'security' && <SecurityDashboard profile={profile} />}
        {profile.role === 'admin' && <AdminDashboard profile={profile} />}
      </main>
    </div>
  );
}

/* ==================== 1. AUTH SCREEN ==================== */
function AuthScreen({ apartmentName }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('resident');
  const [flatNumber, setFlatNumber] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage('');
    setLoading(true);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role,
            flat_number:
              role === 'resident' ? flatNumber.toUpperCase().trim() : null,
          },
        },
      });
      if (error) setMessage(error.message);
      else setMessage('Account created! Logging you in...');
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) setMessage(error.message);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="flex items-center gap-2 justify-center mb-6">
          <div className="bg-indigo-600 p-2.5 rounded-xl text-white">
            <Shield className="w-6 h-6" />
          </div>
          <span className="text-2xl font-bold text-slate-900">
            {apartmentName}
          </span>
        </div>

        <h2 className="text-lg font-semibold text-center text-slate-800 mb-6">
          {isSignUp ? 'Create Society Account' : 'Sign in to your account'}
        </h2>

        {message && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Swaraj Kumar"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="resident">Resident</option>
                  <option value="security">Security Guard</option>
                  <option value="admin">RWA Admin</option>
                </select>
              </div>

              {role === 'resident' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                    Flat Number
                  </label>
                  <input
                    type="text"
                    required
                    value={flatNumber}
                    onChange={(e) => setFlatNumber(e.target.value)}
                    placeholder="e.g. B-402"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              )}
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition text-sm"
          >
            {loading
              ? 'Please wait...'
              : isSignUp
              ? 'Register Account'
              : 'Sign In'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setMessage('');
            }}
            className="text-indigo-600 font-semibold hover:underline"
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  );
}

/* ==================== 2. RESIDENT DASHBOARD ==================== */
function ResidentDashboard({ profile }) {
  const [tab, setTab] = useState('gate');
  const [visitors, setVisitors] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [notices, setNotices] = useState([]);
  const [votes, setVotes] = useState([]);

  const [vName, setVName] = useState('');
  const [vType, setVType] = useState('Guest');
  const [vVehicle, setVVehicle] = useState('');

  const [tCategory, setTCategory] = useState('Plumbing');
  const [tDesc, setTDesc] = useState('');

  const [amenity, setAmenity] = useState('Clubhouse');
  const [bDate, setBDate] = useState('');
  const [bSlot, setBSlot] = useState('06:00 PM - 08:00 PM');

  useEffect(() => {
    loadAllData();

    const channel = supabase
      .channel('resident-gate')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'visitor_logs',
          filter: `flat_number=eq.${profile.flat_number}`,
        },
        () => fetchVisitors()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [profile.flat_number]);

  async function loadAllData() {
    fetchVisitors();
    fetchInvoices();
    fetchTickets();
    fetchBookings();
    fetchNotices();
    fetchVotes();
  }

  async function fetchVisitors() {
    const { data } = await supabase
      .from('visitor_logs')
      .select('*')
      .eq('flat_number', profile.flat_number)
      .order('entry_time', { ascending: false });
    if (data) setVisitors(data);
  }

  async function fetchInvoices() {
    const { data } = await supabase
      .from('maintenance_invoices')
      .select('*')
      .eq('flat_number', profile.flat_number)
      .order('created_at', { ascending: false });
    if (data) setInvoices(data);
  }

  async function fetchTickets() {
    const { data } = await supabase
      .from('helpdesk_tickets')
      .select('*')
      .eq('flat_number', profile.flat_number)
      .order('created_at', { ascending: false });
    if (data) setTickets(data);
  }

  async function fetchBookings() {
    const { data } = await supabase
      .from('amenity_bookings')
      .select('*')
      .order('booking_date', { ascending: true });
    if (data) setBookings(data);
  }

  async function fetchNotices() {
    const { data } = await supabase
      .from('notices')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setNotices(data);
  }

  async function fetchVotes() {
    const { data } = await supabase
      .from('poll_votes')
      .select('*')
      .eq('poll_id', 'solar-rooftop-2026');
    if (data) setVotes(data);
  }

  async function updateVisitorStatus(id, status) {
    await supabase.from('visitor_logs').update({ status }).eq('id', id);
    fetchVisitors();
  }

  async function createPreApproval(e) {
    e.preventDefault();
    const passcode = Math.floor(100000 + Math.random() * 900000).toString();
    await supabase.from('visitor_logs').insert({
      visitor_name: vName,
      visitor_type: vType,
      flat_number: profile.flat_number,
      vehicle_last4: vVehicle || null,
      passcode,
      status: 'Approved',
      logged_by: profile.id,
    });
    setVName('');
    setVVehicle('');
    fetchVisitors();
  }

  async function payInvoice(id) {
    const mockPaymentId = 'pay_' + Math.random().toString(36).substring(2, 11);
    await supabase
      .from('maintenance_invoices')
      .update({
        status: 'Paid',
        razorpay_payment_id: mockPaymentId,
        paid_at: new Date().toISOString(),
      })
      .eq('id', id);
    fetchInvoices();
  }

  async function submitTicket(e) {
    e.preventDefault();
    await supabase.from('helpdesk_tickets').insert({
      flat_number: profile.flat_number,
      category: tCategory,
      description: tDesc,
    });
    setTDesc('');
    fetchTickets();
  }

  async function bookAmenity(e) {
    e.preventDefault();
    const { error } = await supabase.from('amenity_bookings').insert({
      amenity_name: amenity,
      booking_date: bDate,
      time_slot: bSlot,
      flat_number: profile.flat_number,
    });
    if (error) alert('This slot is already booked by another flat!');
    else fetchBookings();
  }

  async function castVote(option) {
    const { error } = await supabase.from('poll_votes').insert({
      poll_id: 'solar-rooftop-2026',
      flat_number: profile.flat_number,
      option_selected: option,
    });
    if (error) alert('Your flat has already voted in this poll.');
    else fetchVotes();
  }

  const pendingVisitors = visitors.filter((v) => v.status === 'Pending');
  const myFlatVoted = votes.some((v) => v.flat_number === profile.flat_number);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 bg-white p-1.5 rounded-xl border border-slate-200">
        {[
          {
            id: 'gate',
            label: `Gate & Visitors (${pendingVisitors.length})`,
            icon: Shield,
          },
          { id: 'payments', label: 'Maintenance Bills', icon: CreditCard },
          { id: 'helpdesk', label: 'Helpdesk & Amenities', icon: Wrench },
          { id: 'community', label: 'Notices & Polls', icon: Bell },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === t.id
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'gate' && (
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 h-fit">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-indigo-600" /> Pre-Approve
              Visitor
            </h3>
            <form onSubmit={createPreApproval} className="space-y-3">
              <input
                type="text"
                required
                placeholder="Visitor / Delivery Name"
                value={vName}
                onChange={(e) => setVName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              <select
                value={vType}
                onChange={(e) => setVType(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              >
                <option value="Guest">Guest</option>
                <option value="Delivery">Delivery</option>
                <option value="Cab">Cab</option>
                <option value="Service">Service / Maid</option>
              </select>
              <input
                type="text"
                maxLength={4}
                placeholder="Vehicle Last 4 Digits (Optional)"
                value={vVehicle}
                onChange={(e) => setVVehicle(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              <button className="w-full py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">
                Generate 6-Digit Entry Pass
              </button>
            </form>
          </div>

          <div className="md:col-span-2 space-y-4">
            {pendingVisitors.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
                <h4 className="font-bold text-amber-900 text-sm mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Waiting at Main Gate (
                  {pendingVisitors.length})
                </h4>
                <div className="space-y-3">
                  {pendingVisitors.map((v) => (
                    <div
                      key={v.id}
                      className="bg-white p-3.5 rounded-lg border border-amber-200 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        {v.visitor_photo && (
                          <img
                            src={v.visitor_photo}
                            alt={v.visitor_name}
                            className="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
                          />
                        )}
                        <div>
                          <p className="font-semibold text-slate-900">
                            {v.visitor_name}{' '}
                            <span className="text-xs px-2 py-0.5 bg-slate-100 rounded">
                              {v.visitor_type}
                            </span>
                          </p>
                          <p className="text-xs text-slate-500">
                            Vehicle: {v.vehicle_last4 || 'None'} • Waiting at
                            gate
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateVisitorStatus(v.id, 'Approved')}
                          className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() =>
                            updateVisitorStatus(v.id, 'Leave-at-Gate')
                          }
                          className="px-3 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-lg"
                        >
                          Leave at Gate
                        </button>
                        <button
                          onClick={() => updateVisitorStatus(v.id, 'Denied')}
                          className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg"
                        >
                          Deny
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-800 mb-4">
                Recent Gate Activity for {profile.flat_number}
              </h3>
              <div className="divide-y divide-slate-100">
                {visitors.length === 0 && (
                  <p className="text-sm text-slate-500 py-4">
                    No visitor logs yet.
                  </p>
                )}
                {visitors.map((v) => (
                  <div
                    key={v.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      {v.visitor_photo && (
                        <img
                          src={v.visitor_photo}
                          alt={v.visitor_name}
                          className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                      )}
                      <div>
                        <p className="font-medium text-sm text-slate-900">
                          {v.visitor_name}{' '}
                          <span className="text-xs text-slate-500">
                            ({v.visitor_type})
                          </span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {v.passcode ? `Passcode: ${v.passcode} • ` : ''}
                          {new Date(v.entry_time).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        v.status === 'Approved' || v.status === 'Checked-In'
                          ? 'bg-emerald-100 text-emerald-700'
                          : v.status === 'Denied'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {v.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'payments' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 mb-4">
            Maintenance Invoices — Flat {profile.flat_number}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 border-b">
                <tr>
                  <th className="p-3">Month</th>
                  <th className="p-3">Base Amount</th>
                  <th className="p-3">Late Fee</th>
                  <th className="p-3">Total</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-4 text-slate-500 text-center">
                      No invoices generated yet.
                    </td>
                  </tr>
                )}
                {invoices.map((inv) => {
                  const total =
                    Number(inv.base_amount) + Number(inv.late_fee || 0);
                  return (
                    <tr key={inv.id}>
                      <td className="p-3 font-medium">{inv.billing_month}</td>
                      <td className="p-3">₹{inv.base_amount}</td>
                      <td className="p-3">₹{inv.late_fee || 0}</td>
                      <td className="p-3 font-bold">₹{total}</td>
                      <td className="p-3">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            inv.status === 'Paid'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="p-3">
                        {inv.status !== 'Paid' ? (
                          <button
                            onClick={() => payInvoice(inv.id)}
                            className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700"
                          >
                            Pay ₹{total}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500">
                            Ref: {inv.razorpay_payment_id}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'helpdesk' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
            <h3 className="font-bold text-slate-800">
              Raise Helpdesk Complaint
            </h3>
            <form onSubmit={submitTicket} className="space-y-3">
              <select
                value={tCategory}
                onChange={(e) => setTCategory(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
              >
                <option value="Plumbing">Plumbing</option>
                <option value="Electrical">Electrical</option>
                <option value="Housekeeping">Housekeeping</option>
                <option value="Lift / Common Area">Lift / Common Area</option>
              </select>
              <textarea
                required
                rows={2}
                placeholder="Describe the issue..."
                value={tDesc}
                onChange={(e) => setTDesc(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
              <button className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg">
                Submit Ticket
              </button>
            </form>

            <div className="pt-4 border-t space-y-2">
              <h4 className="text-xs font-bold uppercase text-slate-500">
                Your Tickets
              </h4>
              {tickets.map((t) => (
                <div
                  key={t.id}
                  className="p-3 bg-slate-50 rounded-lg flex justify-between items-center text-sm"
                >
                  <div>
                    <p className="font-semibold">{t.category}</p>
                    <p className="text-xs text-slate-600">{t.description}</p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 rounded bg-white border">
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
            <h3 className="font-bold text-slate-800">Book Community Amenity</h3>
            <form onSubmit={bookAmenity} className="space-y-3">
              <select
                value={amenity}
                onChange={(e) => setAmenity(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
              >
                <option value="Clubhouse">Clubhouse Hall</option>
                <option value="Badminton Court">Badminton Court</option>
                <option value="Gym">Fitness Gym</option>
                <option value="Guest Room">Guest Suite</option>
              </select>
              <input
                type="date"
                required
                value={bDate}
                onChange={(e) => setBDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
              <select
                value={bSlot}
                onChange={(e) => setBSlot(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
              >
                <option value="07:00 AM - 09:00 AM">07:00 AM - 09:00 AM</option>
                <option value="06:00 PM - 08:00 PM">06:00 PM - 08:00 PM</option>
                <option value="08:00 PM - 10:00 PM">08:00 PM - 10:00 PM</option>
              </select>
              <button className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg">
                Reserve Slot
              </button>
            </form>

            <div className="pt-4 border-t space-y-2">
              <h4 className="text-xs font-bold uppercase text-slate-500">
                Upcoming Society Bookings
              </h4>
              {bookings.map((b) => (
                <div
                  key={b.id}
                  className="p-2.5 bg-slate-50 rounded-lg text-xs flex justify-between"
                >
                  <span className="font-semibold">
                    {b.amenity_name} ({b.flat_number})
                  </span>
                  <span className="text-slate-600">
                    {b.booking_date} • {b.time_slot}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'community' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-3">
            <h3 className="font-bold text-slate-800">RWA Notice Board</h3>
            {notices.length === 0 && (
              <p className="text-sm text-slate-500">
                No notices published yet.
              </p>
            )}
            {notices.map((n) => (
              <div
                key={n.id}
                className="p-3.5 rounded-lg border border-slate-200 bg-slate-50"
              >
                <div className="flex justify-between items-center mb-1">
                  <h4 className="font-bold text-sm text-slate-900">
                    {n.title}
                  </h4>
                  <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">
                    {n.priority}
                  </span>
                </div>
                <p className="text-xs text-slate-600">{n.body}</p>
              </div>
            ))}
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4 h-fit">
            <h3 className="font-bold text-slate-800">Active Community Poll</h3>
            <p className="text-sm text-slate-700 font-medium">
              Should the RWA install rooftop solar panels for common-area
              electricity?
            </p>
            <div className="space-y-2">
              {['Yes, Approve', 'No, Defer', 'Need More Quotes'].map((opt) => {
                const count = votes.filter(
                  (v) => v.option_selected === opt
                ).length;
                return (
                  <button
                    key={opt}
                    disabled={myFlatVoted}
                    onClick={() => castVote(opt)}
                    className="w-full p-3 rounded-lg border border-slate-200 hover:border-indigo-500 flex justify-between items-center text-sm disabled:opacity-75"
                  >
                    <span>{opt}</span>
                    <span className="font-bold text-indigo-600">
                      {count} votes
                    </span>
                  </button>
                );
              })}
            </div>
            {myFlatVoted && (
              <p className="text-xs text-emerald-600 font-medium">
                ✓ Flat {profile.flat_number} has voted.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== 3. SECURITY GUARD DASHBOARD ==================== */
function SecurityDashboard({ profile }) {
  const [visitors, setVisitors] = useState([]);
  const [otpInput, setOtpInput] = useState('');
  const [vName, setVName] = useState('');
  const [vType, setVType] = useState('Delivery');
  const [flatNo, setFlatNo] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [photoData, setPhotoData] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchVisitors();
    const channel = supabase
      .channel('guard-gate')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'visitor_logs' },
        () => fetchVisitors()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  async function fetchVisitors() {
    const { data } = await supabase
      .from('visitor_logs')
      .select('*')
      .order('entry_time', { ascending: false })
      .limit(30);
    if (data) setVisitors(data);
  }

  async function handlePhotoCapture(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressedBase64 = await compressImage(file);
      setPhotoData(compressedBase64);
    } catch {
      alert('Could not process photo. Please try again.');
    }
  }

  async function verifyOtp(e) {
    e.preventDefault();
    const { data } = await supabase
      .from('visitor_logs')
      .select('*')
      .eq('passcode', otpInput.trim())
      .eq('status', 'Approved')
      .single();

    if (!data) {
      alert('Invalid or already used 6-digit passcode!');
      return;
    }
    await supabase
      .from('visitor_logs')
      .update({ status: 'Checked-In' })
      .eq('id', data.id);
    alert(
      `Verified! ${data.visitor_name} for Flat ${data.flat_number} checked in.`
    );
    setOtpInput('');
    fetchVisitors();
  }

  async function logSpotVisitor(e) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.from('visitor_logs').insert({
      visitor_name: vName,
      visitor_type: vType,
      flat_number: flatNo.toUpperCase().trim(),
      vehicle_last4: vehicle || null,
      visitor_photo: photoData || null,
      status: 'Pending',
      logged_by: profile.id,
    });
    if (error) {
      alert('Error logging visitor: ' + error.message);
    } else {
      setVName('');
      setFlatNo('');
      setVehicle('');
      setPhotoData(null);
      fetchVisitors();
    }
    setSubmitting(false);
  }

  async function changeStatus(id, status) {
    const payload = { status };
    if (status === 'Checked-Out') payload.exit_time = new Date().toISOString();
    await supabase.from('visitor_logs').update(payload).eq('id', id);
    fetchVisitors();
  }

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <div className="space-y-6">
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-emerald-600" /> Verify 6-Digit
            Passcode
          </h3>
          <form onSubmit={verifyOtp} className="flex gap-2">
            <input
              type="text"
              maxLength={6}
              required
              placeholder="Enter 6-digit OTP"
              value={otpInput}
              onChange={(e) => setOtpInput(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tracking-widest"
            />
            <button className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg">
              Verify
            </button>
          </form>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4 text-indigo-600" /> New Gate Entry Request
          </h3>
          <form onSubmit={logSpotVisitor} className="space-y-3">
            <input
              type="text"
              required
              placeholder="Visitor Name"
              value={vName}
              onChange={(e) => setVName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
            <input
              type="text"
              required
              placeholder="Flat Number (e.g. B-402)"
              value={flatNo}
              onChange={(e) => setFlatNo(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
            <select
              value={vType}
              onChange={(e) => setVType(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
            >
              <option value="Delivery">Delivery</option>
              <option value="Guest">Guest</option>
              <option value="Cab">Cab</option>
              <option value="Service">Service</option>
            </select>
            <input
              type="text"
              maxLength={4}
              placeholder="Vehicle Last 4 Digits"
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />

            {/* Camera Photo Capture */}
            <div>
              {photoData ? (
                <div className="relative w-full">
                  <img
                    src={photoData}
                    alt="Visitor preview"
                    className="w-full h-36 object-cover rounded-lg border border-slate-300"
                  />
                  <button
                    type="button"
                    onClick={() => setPhotoData(null)}
                    className="absolute top-2 right-2 bg-red-600 text-white text-xs px-2 py-1 rounded-md shadow"
                  >
                    Retake
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 w-full py-2.5 px-3 border-2 border-dashed border-slate-300 rounded-lg text-sm text-slate-600 hover:border-indigo-500 hover:text-indigo-600 cursor-pointer transition">
                  <Camera className="w-4 h-4" />
                  <span>Click Visitor Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoCapture}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            <button
              disabled={submitting}
              className="w-full py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700"
            >
              {submitting ? 'Sending...' : 'Ring Resident for Approval'}
            </button>
          </form>
        </div>
      </div>

      <div className="md:col-span-2 bg-white p-5 rounded-xl border border-slate-200">
        <h3 className="font-bold text-slate-800 mb-4">
          Live Gate Movement Log
        </h3>
        <div className="divide-y">
          {visitors.map((v) => (
            <div
              key={v.id}
              className="py-3 flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex items-center gap-3">
                {v.visitor_photo && (
                  <img
                    src={v.visitor_photo}
                    alt={v.visitor_name}
                    className="w-11 h-11 rounded-lg object-cover border border-slate-200 shrink-0"
                  />
                )}
                <div>
                  <p className="font-semibold text-sm">
                    {v.visitor_name} →{' '}
                    <span className="text-indigo-600">
                      Flat {v.flat_number}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {v.visitor_type} • Vehicle: {v.vehicle_last4 || 'N/A'} •{' '}
                    {new Date(v.entry_time).toLocaleTimeString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    v.status === 'Approved'
                      ? 'bg-emerald-100 text-emerald-700'
                      : v.status === 'Pending'
                      ? 'bg-amber-100 text-amber-800'
                      : v.status === 'Denied'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {v.status}
                </span>
                {v.status === 'Approved' && (
                  <button
                    onClick={() => changeStatus(v.id, 'Checked-In')}
                    className="px-2.5 py-1 bg-indigo-600 text-white text-xs rounded-lg"
                  >
                    Check In
                  </button>
                )}
                {v.status === 'Checked-In' && (
                  <button
                    onClick={() => changeStatus(v.id, 'Checked-Out')}
                    className="px-2.5 py-1 bg-slate-800 text-white text-xs rounded-lg"
                  >
                    Check Out
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ==================== 4. ADMIN DASHBOARD ==================== */
function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [tickets, setTickets] = useState([]);

  const [invFlat, setInvFlat] = useState('');
  const [invMonth, setInvMonth] = useState('December 2026');
  const [invAmount, setInvAmount] = useState('3500');

  const [nTitle, setNTitle] = useState('');
  const [nBody, setNBody] = useState('');

  useEffect(() => {
    fetchUsers();
    fetchInvoices();
    fetchTickets();
  }, []);

  async function fetchUsers() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setUsers(data);
  }

  async function fetchInvoices() {
    const { data } = await supabase
      .from('maintenance_invoices')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setInvoices(data);
  }

  async function fetchTickets() {
    const { data } = await supabase
      .from('helpdesk_tickets')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setTickets(data);
  }

  async function approveUser(id) {
    await supabase.from('profiles').update({ is_approved: true }).eq('id', id);
    fetchUsers();
  }

  async function createInvoice(e) {
    e.preventDefault();
    await supabase.from('maintenance_invoices').insert({
      flat_number: invFlat.toUpperCase().trim(),
      billing_month: invMonth,
      base_amount: Number(invAmount),
      status: 'Pending',
    });
    setInvFlat('');
    fetchInvoices();
  }

  async function publishNotice(e) {
    e.preventDefault();
    await supabase
      .from('notices')
      .insert({ title: nTitle, body: nBody, priority: 'Important' });
    setNTitle('');
    setNBody('');
    alert('Notice published to all residents!');
  }

  async function resolveTicket(id) {
    await supabase
      .from('helpdesk_tickets')
      .update({ status: 'Resolved' })
      .eq('id', id);
    fetchTickets();
  }

  const pendingUsers = users.filter((u) => !u.is_approved);

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200">
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-600" /> User Verification Queue
          ({pendingUsers.length} Pending)
        </h3>
        {pendingUsers.length === 0 ? (
          <p className="text-sm text-slate-500">
            All registered users are verified.
          </p>
        ) : (
          <div className="divide-y">
            {pendingUsers.map((u) => (
              <div
                key={u.id}
                className="py-3 flex items-center justify-between"
              >
                <div>
                  <p className="font-semibold text-sm">{u.full_name}</p>
                  <p className="text-xs text-slate-500 capitalize">
                    Role: {u.role}{' '}
                    {u.flat_number ? `• Flat ${u.flat_number}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => approveUser(u.id)}
                  className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700"
                >
                  Approve Account
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
          <h3 className="font-bold text-slate-800">
            Generate Maintenance Invoice
          </h3>
          <form onSubmit={createInvoice} className="space-y-3">
            <input
              type="text"
              required
              placeholder="Flat Number (e.g. B-402)"
              value={invFlat}
              onChange={(e) => setInvFlat(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
            <input
              type="text"
              required
              value={invMonth}
              onChange={(e) => setInvMonth(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
            <input
              type="number"
              required
              value={invAmount}
              onChange={(e) => setInvAmount(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
            <button className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg">
              Send Invoice
            </button>
          </form>

          <div className="pt-3 border-t space-y-2 max-h-48 overflow-y-auto">
            {invoices.map((i) => (
              <div
                key={i.id}
                className="text-xs flex justify-between p-2 bg-slate-50 rounded"
              >
                <span>
                  <strong>{i.flat_number}</strong> • {i.billing_month} (₹
                  {i.base_amount})
                </span>
                <span
                  className={
                    i.status === 'Paid'
                      ? 'text-emerald-600 font-bold'
                      : 'text-amber-600 font-bold'
                  }
                >
                  {i.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-3">
              Publish Society Notice
            </h3>
            <form onSubmit={publishNotice} className="space-y-3">
              <input
                type="text"
                required
                placeholder="Notice Title"
                value={nTitle}
                onChange={(e) => setNTitle(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
              <textarea
                required
                rows={2}
                placeholder="Notice details..."
                value={nBody}
                onChange={(e) => setNBody(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
              <button className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg">
                Publish Notice
              </button>
            </form>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-3">
              Society Helpdesk Tickets
            </h3>
            <div className="space-y-2">
              {tickets.map((t) => (
                <div
                  key={t.id}
                  className="p-2.5 bg-slate-50 rounded-lg flex justify-between items-center text-xs"
                >
                  <div>
                    <p className="font-bold">
                      {t.flat_number} • {t.category}
                    </p>
                    <p className="text-slate-600">{t.description}</p>
                  </div>
                  {t.status !== 'Resolved' ? (
                    <button
                      onClick={() => resolveTicket(t.id)}
                      className="px-2.5 py-1 bg-emerald-600 text-white rounded"
                    >
                      Mark Resolved
                    </button>
                  ) : (
                    <span className="text-emerald-700 font-semibold">
                      Resolved
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
