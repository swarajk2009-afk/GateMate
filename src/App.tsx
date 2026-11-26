import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import {
  Shield, Users, CreditCard, Wrench, Bell, Clock, LogOut,
  KeyRound, Plus, AlertTriangle, Building2, Pencil, Check, X, Camera, Layers, Settings
} from 'lucide-react';

const DEFAULT_AMENITIES = ['Gym', 'Guest Room'];
const DEFAULT_SLOTS = [
  'Full Day (08:00 AM - 10:00 PM)',
  '07:00 AM - 09:00 AM',
  '06:00 PM - 08:00 PM',
  '08:00 PM - 10:00 PM',
];
const DEFAULT_CATEGORIES = ['Plumbing', 'Electrical', 'Housekeeping', 'Lift / Common Area'];

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

  // Society Settings (Apartment Name + Configurable Dropdown Options)
  const [apartmentName, setApartmentName] = useState('GateMate');
  const [tagline, setTagline] = useState('Smart Society Portal');
  const [amenitiesList, setAmenitiesList] = useState(DEFAULT_AMENITIES);
  const [slotsList, setSlotsList] = useState(DEFAULT_SLOTS);
  const [categoriesList, setCategoriesList] = useState(DEFAULT_CATEGORIES);

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
      .select('apartment_name, tagline, amenities, amenity_slots, helpdesk_categories')
      .eq('id', 1)
      .maybeSingle();

    if (data) {
      setApartmentName(data.apartment_name || 'GateMate');
      setTagline(data.tagline || 'Smart Society Portal');
      if (data.amenities?.length) setAmenitiesList(data.amenities);
      if (data.amenity_slots?.length) setSlotsList(data.amenity_slots);
      if (data.helpdesk_categories?.length) setCategoriesList(data.helpdesk_categories);
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
    setIsEditingName(false);
    await supabase.auth.signOut();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-purple-50 text-indigo-700 font-medium">
        Loading GateMate...
      </div>
    );
  }

  // Always show "GateMate" branding on Login / Sign Up screen
  if (!session) {
    return <AuthScreen />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 text-center">
        <p className="text-slate-800 font-medium mb-2">Could not load user profile.</p>
        {errorMsg && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg mb-4 max-w-md">
            Database Error: {errorMsg}
          </p>
        )}
        <div className="flex gap-3">
          <button
            onClick={() => fetchProfile(session.user)}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg shadow-sm"
          >
            Retry
          </button>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 border border-slate-300 text-slate-700 text-sm rounded-lg bg-white"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (!profile.is_approved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-purple-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-md border border-indigo-100 text-center">
          <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Pending RWA Admin Approval</h2>
          <p className="text-sm text-slate-600 mb-6">
            Hi <span className="font-semibold text-slate-900">{profile.full_name}</span>, your account (
            <span className="capitalize font-medium text-indigo-600">{profile.role}</span>
            {profile.flat_number ? ` • Flat ${profile.flat_number}` : ''}) is awaiting verification by the society administrator.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => fetchProfile(session.user)}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm"
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

  const roleBadgeColor =
    profile.role === 'admin'
      ? 'bg-purple-100 text-purple-800 border-purple-200'
      : profile.role === 'security'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
      : 'bg-sky-100 text-sky-800 border-sky-200';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 text-slate-900">
      <header className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-violet-700 text-white shadow-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/15 backdrop-blur-sm p-2 rounded-xl border border-white/20">
              <Building2 className="w-5 h-5 text-white" />
            </div>

            {isEditingName && profile.role === 'admin' ? (
              <form onSubmit={saveApartmentName} className="flex items-center gap-1.5">
                <input
                  type="text"
                  autoFocus
                  required
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Enter Apartment Name"
                  className="px-3 py-1 text-sm font-bold text-slate-900 bg-white border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 w-44 sm:w-60"
                />
                <button
                  type="submit"
                  disabled={savingName}
                  title="Save Apartment Name"
                  className="p-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 shadow-sm"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingName(false)}
                  title="Cancel"
                  className="p-1.5 bg-white/20 text-white rounded-lg hover:bg-white/30"
                >
                  <X className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="font-bold text-lg leading-tight tracking-tight">{apartmentName}</h1>
                  {profile.role === 'admin' && (
                    <button
                      onClick={() => {
                        setDraftName(apartmentName);
                        setIsEditingName(true);
                      }}
                      title="Edit Apartment Name"
                      className="p-1 text-indigo-200 hover:text-white hover:bg-white/15 rounded-lg transition"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-indigo-200">{tagline}</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-white">{profile.full_name}</p>
              <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize ${roleBadgeColor}`}>
                {profile.role} {profile.flat_number ? `• Flat ${profile.flat_number}` : ''}
              </span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-white/15 hover:bg-red-500/90 border border-white/20 rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {profile.role === 'resident' && (
          <ResidentDashboard
            profile={profile}
            amenitiesList={amenitiesList}
            slotsList={slotsList}
            categoriesList={categoriesList}
          />
        )}
        {profile.role === 'security' && <SecurityDashboard profile={profile} />}
        {profile.role === 'admin' && (
          <AdminDashboard
            amenitiesList={amenitiesList}
            slotsList={slotsList}
            categoriesList={categoriesList}
            onSettingsSaved={fetchSocietySettings}
          />
        )}
      </main>
    </div>
  );
}

/* ==================== 1. AUTH SCREEN (ALWAYS "GateMate") ==================== */
function AuthScreen() {
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
            flat_number: role === 'resident' ? flatNumber.toUpperCase().trim() : null,
          },
        },
      });
      if (error) setMessage(error.message);
      else setMessage('Account created! Logging you in...');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 via-indigo-800 to-violet-900 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl border border-indigo-100 p-8">
        <div className="flex flex-col items-center justify-center mb-6">
          <div className="bg-gradient-to-tr from-indigo-600 to-violet-600 p-3 rounded-2xl text-white shadow-md mb-3">
            <Shield className="w-7 h-7" />
          </div>
          <span className="text-2xl font-extrabold text-slate-900 tracking-tight">GateMate</span>
          <span className="text-xs text-slate-500 mt-0.5">Smart Gated Community & RWA Portal</span>
        </div>

        <h2 className="text-base font-semibold text-center text-slate-700 mb-5">
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
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Swaraj Kumar"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="resident">Resident</option>
                  <option value="security">Security Guard</option>
                  <option value="admin">RWA Admin</option>
                </select>
              </div>

              {role === 'resident' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Flat Number</label>
                  <input
                    type="text"
                    required
                    value={flatNumber}
                    onChange={(e) => setFlatNumber(e.target.value)}
                    placeholder="e.g. B-402"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              )}
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold rounded-lg hover:from-indigo-700 hover:to-violet-700 transition text-sm shadow-md"
          >
            {loading ? 'Please wait...' : isSignUp ? 'Register Account' : 'Sign In'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => { setIsSignUp(!isSignUp); setMessage(''); }}
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
function ResidentDashboard({ profile, amenitiesList, slotsList, categoriesList }) {
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

  const [tCategory, setTCategory] = useState(categoriesList[0] || 'Plumbing');
  const [tDesc, setTDesc] = useState('');

  const [amenity, setAmenity] = useState(amenitiesList[0] || 'Clubhouse');
  const [bDate, setBDate] = useState('');
  const [bSlot, setBSlot] = useState(slotsList[0] || 'Full Day (08:00 AM - 10:00 PM)');

  useEffect(() => {
    if (categoriesList.length && !categoriesList.includes(tCategory)) setTCategory(categoriesList[0]);
  }, [categoriesList]);

  useEffect(() => {
    if (amenitiesList.length && !amenitiesList.includes(amenity)) setAmenity(amenitiesList[0]);
  }, [amenitiesList]);

  useEffect(() => {
    if (slotsList.length && !slotsList.includes(bSlot)) setBSlot(slotsList[0]);
  }, [slotsList]);

  useEffect(() => {
    loadAllData();

    const channel = supabase
      .channel('resident-gate')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'visitor_logs', filter: `flat_number=eq.${profile.flat_number}` },
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
    const { data } = await supabase.from('poll_votes').select('*').eq('poll_id', 'solar-rooftop-2026');
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

    // Prevent conflicts if Full Day is booked or if any slot is already booked on a Full Day
    const sameDayBookings = bookings.filter(
      (b) => b.amenity_name === amenity && b.booking_date === bDate
    );
    const isFullDayRequest = bSlot.toLowerCase().includes('full day');
    const hasFullDayBooked = sameDayBookings.some((b) => b.time_slot.toLowerCase().includes('full day'));
    const hasExactSlot = sameDayBookings.some((b) => b.time_slot === bSlot);

    if (hasFullDayBooked || hasExactSlot || (isFullDayRequest && sameDayBookings.length > 0)) {
      alert(`${amenity} is unavailable for "${bSlot}" on ${bDate} due to an existing booking.`);
      return;
    }

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
      <div className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl shadow-sm border border-indigo-100">
        {[
          { id: 'gate', label: `Gate & Visitors (${pendingVisitors.length})`, icon: Shield },
          { id: 'payments', label: 'Maintenance Bills', icon: CreditCard },
          { id: 'helpdesk', label: 'Helpdesk & Amenities', icon: Wrench },
          { id: 'community', label: 'Notices & Polls', icon: Bell },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
                tab === t.id
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'
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
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-indigo-600 h-fit">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-indigo-600" /> Pre-Approve Visitor
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
              <button className="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 shadow-sm">
                Generate 6-Digit Entry Pass
              </button>
            </form>
          </div>

          <div className="md:col-span-2 space-y-4">
            {pendingVisitors.length > 0 && (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-2xl p-4 shadow-sm">
                <h4 className="font-bold text-amber-900 text-sm mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" /> Waiting at Main Gate ({pendingVisitors.length})
                </h4>
                <div className="space-y-3">
                  {pendingVisitors.map((v) => (
                    <div key={v.id} className="bg-white p-3.5 rounded-xl border border-amber-200 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                      <div className="flex items-center gap-3">
                        {v.visitor_photo && (
                          <img
                            src={v.visitor_photo}
                            alt={v.visitor_name}
                            className="w-14 h-14 rounded-xl object-cover border border-slate-200 shrink-0"
                          />
                        )}
                        <div>
                          <p className="font-semibold text-slate-900">
                            {v.visitor_name}{' '}
                            <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-medium">{v.visitor_type}</span>
                          </p>
                          <p className="text-xs text-slate-500">Vehicle: {v.vehicle_last4 || 'None'} • Waiting at gate</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => updateVisitorStatus(v.id, 'Approved')} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg">Approve</button>
                        <button onClick={() => updateVisitorStatus(v.id, 'Leave-at-Gate')} className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg">Leave at Gate</button>
                        <button onClick={() => updateVisitorStatus(v.id, 'Denied')} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg">Deny</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5">
              <h3 className="font-bold text-slate-800 mb-4">Recent Gate Activity for {profile.flat_number}</h3>
              <div className="divide-y divide-slate-100">
                {visitors.length === 0 && <p className="text-sm text-slate-500 py-4">No visitor logs yet.</p>}
                {visitors.map((v) => (
                  <div key={v.id} className="py-3 flex items-center justify-between gap-3">
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
                          {v.visitor_name} <span className="text-xs text-slate-500">({v.visitor_type})</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {v.passcode ? `Passcode: ${v.passcode} • ` : ''}
                          {new Date(v.entry_time).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      v.status === 'Approved' || v.status === 'Checked-In' ? 'bg-emerald-100 text-emerald-700' :
                      v.status === 'Denied' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'
                    }`}>
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
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-emerald-500 p-5">
          <h3 className="font-bold text-slate-800 mb-4">Maintenance Invoices — Flat {profile.flat_number}</h3>
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
                  <tr><td colSpan={6} className="p-4 text-slate-500 text-center">No invoices generated yet.</td></tr>
                )}
                {invoices.map((inv) => {
                  const total = Number(inv.base_amount) + Number(inv.late_fee || 0);
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/70">
                      <td className="p-3 font-medium">{inv.billing_month}</td>
                      <td className="p-3">₹{inv.base_amount}</td>
                      <td className="p-3">₹{inv.late_fee || 0}</td>
                      <td className="p-3 font-bold text-slate-900">₹{total}</td>
                      <td className="p-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="p-3">
                        {inv.status !== 'Paid' ? (
                          <button
                            onClick={() => payInvoice(inv.id)}
                            className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 shadow-sm"
                          >
                            Pay ₹{total}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500 font-mono">Ref: {inv.razorpay_payment_id}</span>
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
          {/* Raise Helpdesk Complaint (Uses Admin-Configured Categories) */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-amber-500 space-y-4">
            <h3 className="font-bold text-slate-800">Raise Helpdesk Complaint</h3>
            <form onSubmit={submitTicket} className="space-y-3">
              <select
                value={tCategory}
                onChange={(e) => setTCategory(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
              >
                {categoriesList.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <textarea
                required
                rows={2}
                placeholder="Describe the issue..."
                value={tDesc}
                onChange={(e) => setTDesc(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
              <button className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">
                Submit Ticket
              </button>
            </form>

            <div className="pt-4 border-t space-y-2">
              <h4 className="text-xs font-bold uppercase text-slate-500">Your Tickets</h4>
              {tickets.map((t) => (
                <div key={t.id} className="p-3 bg-slate-50 rounded-xl flex justify-between items-center text-sm">
                  <div>
                    <p className="font-semibold">{t.category}</p>
                    <p className="text-xs text-slate-600">{t.description}</p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white border border-slate-200">{t.status}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Book Community Amenity (Uses Admin-Configured Amenities & Slots including Full Day) */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-violet-500 space-y-4">
            <h3 className="font-bold text-slate-800">Book Community Amenity</h3>
            <form onSubmit={bookAmenity} className="space-y-3">
              <select
                value={amenity}
                onChange={(e) => setAmenity(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
              >
                {amenitiesList.map((am) => (
                  <option key={am} value={am}>{am}</option>
                ))}
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
                {slotsList.map((sl) => (
                  <option key={sl} value={sl}>{sl}</option>
                ))}
              </select>
              <button className="px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700">
                Reserve Slot
              </button>
            </form>

            <div className="pt-4 border-t space-y-2">
              <h4 className="text-xs font-bold uppercase text-slate-500">Upcoming Society Bookings</h4>
              {bookings.map((b) => (
                <div key={b.id} className="p-2.5 bg-slate-50 rounded-xl text-xs flex justify-between">
                  <span className="font-semibold text-indigo-700">{b.amenity_name} ({b.flat_number})</span>
                  <span className="text-slate-600">{b.booking_date} • {b.time_slot}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'community' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-sky-500 space-y-3">
            <h3 className="font-bold text-slate-800">RWA Notice Board</h3>
            {notices.length === 0 && <p className="text-sm text-slate-500">No notices published yet.</p>}
            {notices.map((n) => (
              <div key={n.id} className="p-3.5 rounded-xl border border-sky-100 bg-sky-50/40">
                <div className="flex justify-between items-center mb-1">
                  <h4 className="font-bold text-sm text-slate-900">{n.title}</h4>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">{n.priority}</span>
                </div>
                <p className="text-xs text-slate-600">{n.body}</p>
              </div>
            ))}
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-emerald-500 space-y-4 h-fit">
            <h3 className="font-bold text-slate-800">Active Community Poll</h3>
            <p className="text-sm text-slate-700 font-medium">
              Should the RWA install rooftop solar panels for common-area electricity?
            </p>
            <div className="space-y-2">
              {['Yes, Approve', 'No, Defer', 'Need More Quotes'].map((opt) => {
                const count = votes.filter((v) => v.option_selected === opt).length;
                return (
                  <button
                    key={opt}
                    disabled={myFlatVoted}
                    onClick={() => castVote(opt)}
                    className="w-full p-3 rounded-xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/50 flex justify-between items-center text-sm disabled:opacity-75 transition"
                  >
                    <span className="font-medium">{opt}</span>
                    <span className="font-bold text-indigo-600">{count} votes</span>
                  </button>
                );
              })}
            </div>
            {myFlatVoted && <p className="text-xs text-emerald-600 font-semibold">✓ Flat {profile.flat_number} has voted.</p>}
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visitor_logs' }, () => fetchVisitors())
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
    await supabase.from('visitor_logs').update({ status: 'Checked-In' }).eq('id', data.id);
    alert(`Verified! ${data.visitor_name} for Flat ${data.flat_number} checked in.`);
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
    const payload: any = { status };
    if (status === 'Checked-Out') payload.exit_time = new Date().toISOString();
    await supabase.from('visitor_logs').update(payload).eq('id', id);
    fetchVisitors();
  }

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <div className="space-y-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-emerald-500">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-emerald-600" /> Verify 6-Digit Passcode
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
            <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg shadow-sm">Verify</button>
          </form>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-indigo-600">
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
            <select value={vType} onChange={(e) => setVType(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
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

            <div>
              {photoData ? (
                <div className="relative w-full">
                  <img
                    src={photoData}
                    alt="Visitor preview"
                    className="w-full h-36 object-cover rounded-xl border border-slate-300"
                  />
                  <button
                    type="button"
                    onClick={() => setPhotoData(null)}
                    className="absolute top-2 right-2 bg-red-600 text-white text-xs px-2.5 py-1 rounded-lg shadow"
                  >
                    Retake
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 w-full py-2.5 px-3 border-2 border-dashed border-indigo-200 bg-indigo-50/40 rounded-xl text-sm font-medium text-indigo-700 hover:border-indigo-500 cursor-pointer transition">
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
              className="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 shadow-sm"
            >
              {submitting ? 'Sending...' : 'Ring Resident for Approval'}
            </button>
          </form>
        </div>
      </div>

      <div className="md:col-span-2 bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80">
        <h3 className="font-bold text-slate-800 mb-4">Live Gate Movement Log</h3>
        <div className="divide-y">
          {visitors.map((v) => (
            <div key={v.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                {v.visitor_photo && (
                  <img
                    src={v.visitor_photo}
                    alt={v.visitor_name}
                    className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0"
                  />
                )}
                <div>
                  <p className="font-semibold text-sm">
                    {v.visitor_name} → <span className="text-indigo-600">Flat {v.flat_number}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {v.visitor_type} • Vehicle: {v.vehicle_last4 || 'N/A'} • {new Date(v.entry_time).toLocaleTimeString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  v.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                  v.status === 'Pending' ? 'bg-amber-100 text-amber-800' :
                  v.status === 'Denied' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'
                }`}>
                  {v.status}
                </span>
                {v.status === 'Approved' && (
                  <button onClick={() => changeStatus(v.id, 'Checked-In')} className="px-2.5 py-1 bg-indigo-600 text-white text-xs rounded-lg">
                    Check In
                  </button>
                )}
                {v.status === 'Checked-In' && (
                  <button onClick={() => changeStatus(v.id, 'Checked-Out')} className="px-2.5 py-1 bg-slate-800 text-white text-xs rounded-lg">
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
function AdminDashboard({ amenitiesList, slotsList, categoriesList, onSettingsSaved }) {
  const [users, setUsers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [tickets, setTickets] = useState([]);

  // Single vs Bulk Invoice State
  const [billingMode, setBillingMode] = useState('bulk');
  const [invFlat, setInvFlat] = useState('');
  const [extraFlats, setExtraFlats] = useState('');
  const [invMonth, setInvMonth] = useState('December 2026');
  const [invAmount, setInvAmount] = useState('3500');
  const [sendingInv, setSendingInv] = useState(false);

  // Notice State
  const [nTitle, setNTitle] = useState('');
  const [nBody, setNBody] = useState('');

  // Editable Amenity, Slot & Helpdesk Options State
  const [editAmenities, setEditAmenities] = useState(amenitiesList.join(', '));
  const [editSlots, setEditSlots] = useState(slotsList.join(', '));
  const [editCategories, setEditCategories] = useState(categoriesList.join(', '));
  const [savingOptions, setSavingOptions] = useState(false);

  useEffect(() => {
    setEditAmenities(amenitiesList.join(', '));
    setEditSlots(slotsList.join(', '));
    setEditCategories(categoriesList.join(', '));
  }, [amenitiesList, slotsList, categoriesList]);

  useEffect(() => {
    fetchUsers();
    fetchInvoices();
    fetchTickets();
  }, []);

  async function fetchUsers() {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (data) setUsers(data);
  }

  async function fetchInvoices() {
    const { data } = await supabase.from('maintenance_invoices').select('*').order('created_at', { ascending: false });
    if (data) setInvoices(data);
  }

  async function fetchTickets() {
    const { data } = await supabase.from('helpdesk_tickets').select('*').order('created_at', { ascending: false });
    if (data) setTickets(data);
  }

  async function approveUser(id) {
    await supabase.from('profiles').update({ is_approved: true }).eq('id', id);
    fetchUsers();
  }

  async function savePortalOptions(e) {
    e.preventDefault();
    setSavingOptions(true);

    const parsedAmenities = editAmenities.split(',').map((s) => s.trim()).filter(Boolean);
    const parsedSlots = editSlots.split(',').map((s) => s.trim()).filter(Boolean);
    const parsedCategories = editCategories.split(',').map((s) => s.trim()).filter(Boolean);

    if (!parsedAmenities.length || !parsedSlots.length || !parsedCategories.length) {
      alert('Each list must contain at least one option.');
      setSavingOptions(false);
      return;
    }

    const { error } = await supabase
      .from('society_settings')
      .update({
        amenities: parsedAmenities,
        amenity_slots: parsedSlots,
        helpdesk_categories: parsedCategories,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    if (error) {
      alert('Failed to update options: ' + error.message);
    } else {
      await onSettingsSaved();
      alert('Amenity, Full-Day Slot, and Helpdesk options updated for all residents!');
    }
    setSavingOptions(false);
  }

  const knownFlats = Array.from(
    new Set([
      ...users.map((u) => u.flat_number).filter(Boolean).map((f) => f.toUpperCase().trim()),
      ...invoices.map((i) => i.flat_number).filter(Boolean).map((f) => f.toUpperCase().trim()),
    ])
  ).sort();

  async function handleGenerateInvoice(e) {
    e.preventDefault();
    setSendingInv(true);

    let targetFlats = [];
    if (billingMode === 'single') {
      targetFlats = [invFlat.toUpperCase().trim()];
    } else {
      const manualFlats = extraFlats
        .split(',')
        .map((f) => f.toUpperCase().trim())
        .filter(Boolean);
      targetFlats = Array.from(new Set([...knownFlats, ...manualFlats]));
    }

    if (targetFlats.length === 0) {
      alert('No flats found! Enter flat numbers (e.g. 101, 102, 201) or approve resident accounts first.');
      setSendingInv(false);
      return;
    }

    const alreadyBilled = new Set(
      invoices
        .filter((i) => i.billing_month.toLowerCase() === invMonth.trim().toLowerCase())
        .map((i) => i.flat_number.toUpperCase().trim())
    );

    const rowsToInsert = targetFlats
      .filter((flat) => !alreadyBilled.has(flat))
      .map((flat) => ({
        flat_number: flat,
        billing_month: invMonth.trim(),
        base_amount: Number(invAmount),
        status: 'Pending',
      }));

    if (rowsToInsert.length === 0) {
      alert(`All ${targetFlats.length} flat(s) already have an invoice for ${invMonth}.`);
      setSendingInv(false);
      return;
    }

    const { error } = await supabase.from('maintenance_invoices').insert(rowsToInsert);
    if (error) {
      alert('Error creating invoices: ' + error.message);
    } else {
      alert(`Sent ${rowsToInsert.length} invoice(s) for ${invMonth}!`);
      setInvFlat('');
      setExtraFlats('');
      fetchInvoices();
    }
    setSendingInv(false);
  }

  async function publishNotice(e) {
    e.preventDefault();
    await supabase.from('notices').insert({ title: nTitle, body: nBody, priority: 'Important' });
    setNTitle('');
    setNBody('');
    alert('Notice published to all residents!');
  }

  async function resolveTicket(id) {
    await supabase.from('helpdesk_tickets').update({ status: 'Resolved' }).eq('id', id);
    fetchTickets();
  }

  const pendingUsers = users.filter((u) => !u.is_approved);

  return (
    <div className="space-y-6">
      {/* User Verification Queue */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-indigo-600">
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-600" /> User Verification Queue ({pendingUsers.length} Pending)
        </h3>
        {pendingUsers.length === 0 ? (
          <p className="text-sm text-slate-500">All registered users are verified.</p>
        ) : (
          <div className="divide-y">
            {pendingUsers.map((u) => (
              <div key={u.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm text-slate-900">{u.full_name}</p>
                  <p className="text-xs text-slate-500 capitalize">
                    Role: <span className="font-medium text-indigo-600">{u.role}</span> {u.flat_number ? `• Flat ${u.flat_number}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => approveUser(u.id)}
                  className="px-3.5 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 shadow-sm"
                >
                  Approve Account
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Bulk & Single Maintenance Invoice Generator */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-emerald-500 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" /> Maintenance Billing
            </h3>

            <div className="flex bg-slate-100 p-1 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => setBillingMode('bulk')}
                className={`px-2.5 py-1 rounded-md transition ${
                  billingMode === 'bulk' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600'
                }`}
              >
                All Flats (Bulk)
              </button>
              <button
                type="button"
                onClick={() => setBillingMode('single')}
                className={`px-2.5 py-1 rounded-md transition ${
                  billingMode === 'single' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600'
                }`}
              >
                Single Flat
              </button>
            </div>
          </div>

          <form onSubmit={handleGenerateInvoice} className="space-y-3">
            {billingMode === 'bulk' ? (
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                <p className="text-xs text-emerald-900 font-medium">
                  Detected Society Flats ({knownFlats.length}):{' '}
                  <span className="font-bold">
                    {knownFlats.length > 0 ? knownFlats.join(', ') : 'None yet'}
                  </span>
                </p>
                <input
                  type="text"
                  placeholder="Add extra flats (optional, e.g. 102, 201, 202)"
                  value={extraFlats}
                  onChange={(e) => setExtraFlats(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-emerald-300 rounded-lg text-xs"
                />
              </div>
            ) : (
              <input
                type="text"
                required
                placeholder="Flat Number (e.g. B-402)"
                value={invFlat}
                onChange={(e) => setInvFlat(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Billing Month</label>
                <input
                  type="text"
                  required
                  value={invMonth}
                  onChange={(e) => setInvMonth(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Amount (₹)</label>
                <input
                  type="number"
                  required
                  value={invAmount}
                  onChange={(e) => setInvAmount(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
            </div>

            <button
              disabled={sendingInv}
              className={`w-full py-2.5 text-white text-sm font-semibold rounded-lg shadow-sm transition ${
                billingMode === 'bulk'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {sendingInv
                ? 'Generating Invoices...'
                : billingMode === 'bulk'
                ? 'Raise Bulk Invoices for All Flats'
                : 'Send Single Invoice'}
            </button>
          </form>

          <div className="pt-3 border-t space-y-2 max-h-52 overflow-y-auto">
            {invoices.map((i) => (
              <div key={i.id} className="text-xs flex justify-between items-center p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span>
                  <strong className="text-slate-900">Flat {i.flat_number}</strong> • {i.billing_month} (₹{i.base_amount})
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full font-bold ${
                    i.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {i.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Publish Notice + Open Tickets */}
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-sky-500">
            <h3 className="font-bold text-slate-800 mb-3">Publish Society Notice</h3>
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
              <button className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-lg shadow-sm">
                Publish Notice
              </button>
            </form>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-amber-500">
            <h3 className="font-bold text-slate-800 mb-3">Society Helpdesk Tickets</h3>
            <div className="space-y-2">
              {tickets.length === 0 && <p className="text-xs text-slate-500">No open helpdesk tickets.</p>}
              {tickets.map((t) => (
                <div key={t.id} className="p-2.5 bg-slate-50 rounded-xl flex justify-between items-center text-xs border border-slate-100">
                  <div>
                    <p className="font-bold text-slate-900">Flat {t.flat_number} • {t.category}</p>
                    <p className="text-slate-600">{t.description}</p>
                  </div>
                  {t.status !== 'Resolved' ? (
                    <button onClick={() => resolveTicket(t.id)} className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium">
                      Mark Resolved
                    </button>
                  ) : (
                    <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">Resolved</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Amenity, Full-Day Slot & Helpdesk Dropdown Options */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-violet-600">
        <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2">
          <Settings className="w-4 h-4 text-violet-600" /> Configure Amenity & Helpdesk Options
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Edit comma-separated lists below. Changes apply immediately to all Residents' booking and complaint forms.
        </p>

        <form onSubmit={savePortalOptions} className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Community Amenities
            </label>
            <textarea
              rows={3}
              required
              value={editAmenities}
              onChange={(e) => setEditAmenities(e.target.value)}
              placeholder="Clubhouse, Badminton Court, Gym, Guest Room"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Booking Time Slots (Includes Full Day)
            </label>
            <textarea
              rows={3}
              required
              value={editSlots}
              onChange={(e) => setEditSlots(e.target.value)}
              placeholder="Full Day (08:00 AM - 10:00 PM), 07:00 AM - 09:00 AM, ..."
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Helpdesk Complaint Categories
            </label>
            <textarea
              rows={3}
              required
              value={editCategories}
              onChange={(e) => setEditCategories(e.target.value)}
              placeholder="Plumbing, Electrical, Housekeeping, Lift / Common Area"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
            />
          </div>

          <div className="md:col-span-3 flex justify-end">
            <button
              disabled={savingOptions}
              className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl shadow-sm transition"
            >
              {savingOptions ? 'Saving Options...' : 'Save Amenity & Helpdesk Options'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}