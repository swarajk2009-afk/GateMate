// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import {
  Shield, Users, CreditCard, Wrench, Bell, Clock, LogOut,
  KeyRound, Plus, AlertTriangle, Building2, Pencil, Check, X, Camera, Layers, Settings, Crown, UserPlus, Share2, Copy, ExternalLink, CheckCircle2, Home, UserCheck, UserMinus, Volume2, VolumeX, Phone, MessageCircle
} from 'lucide-react';

const DEFAULT_AMENITIES = ['Clubhouse', 'Badminton Court', 'Gym', 'Guest Room'];
const DEFAULT_SLOTS = [
  'Full Day (08:00 AM - 10:00 PM)',
  '07:00 AM - 09:00 AM',
  '06:00 PM - 08:00 PM',
  '08:00 PM - 10:00 PM',
];
const DEFAULT_CATEGORIES = ['Plumbing', 'Electrical', 'Housekeeping', 'Lift / Common Area'];

function shareNoticeToWhatsApp(apartmentName, title, body) {
  const message =
    `*${apartmentName || 'Society'} — Official Notice*\n\n` +
    `*${title.trim()}*\n` +
    `${body.trim()}\n\n` +
    `_Sent via GateMate_`;
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function formatWhatsAppPhone(rawPhone) {
  const digits = (rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function sendApprovalWhatsApp(apartmentName, user, isPrimaryOwner) {
  const waPhone = formatWhatsAppPhone(user.phone_number);
  if (!waPhone) return false;

  const roleDesc =
    user.role === 'resident'
      ? `${formatResidentTypeLabel(user.resident_type)}${isPrimaryOwner ? ' (Primary)' : ''}`
      : user.role.toUpperCase();

  const flatLine = user.flat_number ? `*Flat Number:* ${user.flat_number}\n` : '';

  const message =
    `Hello *${user.full_name}*,\n\n` +
    `Your *GateMate* account for *${apartmentName || 'our Society'}* has been *APPROVED* by the RWA Admin.\n\n` +
    `${flatLine}` +
    `*Account Type:* ${roleDesc}\n\n` +
    `You can now log in to GateMate to approve visitors at the gate, view maintenance bills, and receive society notices.\n\n` +
    `_Welcome to ${apartmentName || 'GateMate'}!_`;

  const url = `https://api.whatsapp.com/send?phone=${waPhone}&text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

function buildUpiPaymentUrl({ upiId, payeeName, amount, flatNumber, billingMonth }) {
  const note = `Flat ${flatNumber} - ${billingMonth}`;
  const params = new URLSearchParams({
    pa: upiId.trim(),
    pn: (payeeName || 'Society RWA').trim(),
    am: Number(amount).toFixed(2),
    cu: 'INR',
    tn: note,
  });
  return `upi://pay?${params.toString()}`;
}

function launchUpiIntent(upiUrl) {
  window.location.href = upiUrl;
}

function formatResidentTypeLabel(type) {
  if (type === 'family') return 'Family Member';
  if (type === 'tenant') return 'Tenant';
  return 'Owner';
}

function normalizePhoneInput(raw) {
  return (raw || '').replace(/[^\d+]/g, '').trim();
}

function playDoorbellChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const notes = [
      { freq: 880, start: 0, duration: 0.45 },
      { freq: 659.25, start: 0.35, duration: 0.75 },
    ];

    notes.forEach(({ freq, start, duration }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + start);

      gain.gain.setValueAtTime(0.001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.45, now + start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + duration + 0.05);
    });

    if (navigator.vibrate) {
      navigator.vibrate([400, 150, 500]);
    }
  } catch (err) {
    console.warn('Audio ring blocked until first user tap:', err);
  }
}

async function triggerAndroidGateNotification(visitor) {
  try {
    const LocalNotifications = window?.Capacitor?.Plugins?.LocalNotifications;
    if (!LocalNotifications) return;

    await LocalNotifications.requestPermissions();
    await LocalNotifications.createChannel({
      id: 'gatemate_doorbell',
      name: 'GateMate Visitor Doorbell',
      description: 'Urgent ring alerts when a visitor arrives at the main gate',
      importance: 5,
      visibility: 1,
      sound: 'default',
      vibration: true,
    });

    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Date.now() % 1000000),
          title: `Visitor at Gate: ${visitor.visitor_name}`,
          body: `${visitor.visitor_type} waiting for Flat ${visitor.flat_number}. Tap to Approve or Deny.`,
          channelId: 'gatemate_doorbell',
          schedule: { at: new Date(Date.now() + 100) },
          smallIcon: 'ic_launcher',
        },
      ],
    });
  } catch (err) {
    console.warn('Native notification skipped in browser:', err);
  }
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [apartment, setApartment] = useState(null);
  const [apartmentsList, setApartmentsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Inline editable Apartment Name (Admin only)
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    fetchAllApartments();

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
        setApartment(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchAllApartments() {
    const { data } = await supabase
      .from('apartments')
      .select('*')
      .order('created_at', { ascending: true });
    if (data) setApartmentsList(data);
    return data || [];
  }

  async function fetchApartmentById(aptId) {
    if (!aptId) {
      setApartment(null);
      return;
    }
    const { data } = await supabase
      .from('apartments')
      .select('*')
      .eq('id', aptId)
      .maybeSingle();
    if (data) setApartment(data);
  }

  async function saveApartmentName(e) {
    e.preventDefault();
    if (!draftName.trim() || !apartment?.id) return;
    setSavingName(true);

    const { error } = await supabase
      .from('apartments')
      .update({ name: draftName.trim() })
      .eq('id', apartment.id);

    if (!error) {
      setApartment({ ...apartment, name: draftName.trim() });
      setIsEditingName(false);
      fetchAllApartments();
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
      const role = meta.role || 'resident';
      const normalizedFlat = role === 'resident' && meta.flat_number
        ? meta.flat_number.toUpperCase().trim()
        : null;
      const residentType = role === 'resident' ? (meta.resident_type || 'owner') : null;
      const phoneNumber = meta.phone_number ? normalizePhoneInput(meta.phone_number) : null;

      let shouldBePrimary = false;
      if (role === 'resident' && residentType === 'owner' && normalizedFlat && meta.apartment_id) {
        const { data: existingPrimary } = await supabase
          .from('profiles')
          .select('id')
          .eq('apartment_id', meta.apartment_id)
          .eq('flat_number', normalizedFlat)
          .eq('is_flat_primary', true)
          .maybeSingle();
        if (!existingPrimary) {
          shouldBePrimary = true;
        }
      }

      const { data: created, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          full_name: meta.full_name || user.email.split('@')[0],
          role,
          flat_number: normalizedFlat,
          apartment_id: meta.apartment_id || null,
          resident_type: residentType,
          phone_number: phoneNumber,
          is_flat_primary: shouldBePrimary,
          is_approved: role === 'dev',
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
    if (data?.apartment_id) {
      await fetchApartmentById(data.apartment_id);
    }
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

  if (!session) {
    return <AuthScreen apartmentsList={apartmentsList} refreshApartments={fetchAllApartments} />;
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
          <button onClick={() => fetchProfile(session.user)} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg shadow-sm">
            Retry
          </button>
          <button onClick={handleSignOut} className="px-4 py-2 border border-slate-300 text-slate-700 text-sm rounded-lg bg-white">
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (!profile.is_approved) {
    const approverLabel =
      profile.role === 'admin'
        ? 'the Super User (Dev)'
        : profile.role === 'resident' && profile.resident_type && profile.resident_type !== 'owner'
        ? `your Flat ${profile.flat_number} Primary Owner or RWA Admin`
        : 'your Apartment RWA Admin';

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-purple-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-md border border-indigo-100 text-center">
          <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Pending Approval</h2>
          <p className="text-sm text-slate-600 mb-6">
            Hi <span className="font-semibold text-slate-900">{profile.full_name}</span>, your account (
            <span className="capitalize font-medium text-indigo-600">
              {profile.role === 'resident' ? formatResidentTypeLabel(profile.resident_type) : profile.role}
            </span>
            {profile.flat_number ? ` • Flat ${profile.flat_number}` : ''}) is awaiting verification by{' '}
            {approverLabel}.
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

  const headerTitle =
    profile.role === 'dev'
      ? 'GateMate Super Console'
      : apartment?.name || 'GateMate';
  const headerSubtitle =
    profile.role === 'dev'
      ? 'Master Multi-Apartment Control (Dev)'
      : apartment?.tagline || 'Smart Society Portal';

  const roleBadgeColor =
    profile.role === 'dev'
      ? 'bg-amber-100 text-amber-900 border-amber-300'
      : profile.role === 'admin'
      ? 'bg-purple-100 text-purple-800 border-purple-200'
      : profile.role === 'security'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
      : 'bg-sky-100 text-sky-800 border-sky-200';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 text-slate-900">
      <header className="bg-gradient-to-r from-indigo-800 via-indigo-700 to-violet-800 text-white shadow-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="bg-white/15 backdrop-blur-sm p-2 rounded-xl border border-white/20 shrink-0">
              {profile.role === 'dev' ? <Crown className="w-5 h-5 text-amber-300" /> : <Building2 className="w-5 h-5 text-white" />}
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
                  className="px-2.5 py-1 text-sm font-bold text-slate-900 bg-white border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 w-36 sm:w-60"
                />
                <button type="submit" disabled={savingName} title="Save" className="p-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600">
                  <Check className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => setIsEditingName(false)} title="Cancel" className="p-1.5 bg-white/20 text-white rounded-lg hover:bg-white/30">
                  <X className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="font-bold text-base sm:text-lg leading-tight tracking-tight truncate">{headerTitle}</h1>
                  {profile.role === 'admin' && apartment && (
                    <button
                      onClick={() => {
                        setDraftName(apartment.name);
                        setIsEditingName(true);
                      }}
                      title="Edit Apartment Name"
                      className="p-1 text-indigo-200 hover:text-white hover:bg-white/15 rounded-lg transition shrink-0"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-[11px] sm:text-xs text-indigo-200 truncate">{headerSubtitle}</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="text-right">
              <p className="text-xs sm:text-sm font-semibold text-white leading-tight max-w-[90px] sm:max-w-none truncate">
                {profile.full_name}
              </p>
              <span className={`inline-block text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize ${roleBadgeColor}`}>
                {profile.role === 'dev'
                  ? 'Super User'
                  : profile.role === 'resident'
                  ? formatResidentTypeLabel(profile.resident_type)
                  : profile.role}
                {profile.flat_number ? ` • ${profile.flat_number}` : ''}
              </span>
            </div>
            <button
              onClick={handleSignOut}
              title="Logout"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium text-white bg-white/15 hover:bg-red-500/90 border border-white/20 rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-5 sm:py-6">
        {profile.role === 'dev' && (
          <SuperDevDashboard
            apartmentsList={apartmentsList}
            refreshApartments={fetchAllApartments}
          />
        )}
        {profile.role === 'resident' && (
          <ResidentDashboard
            profile={profile}
            apartment={apartment}
            onProfileUpdated={() => fetchProfile(session.user)}
          />
        )}
        {profile.role === 'security' && (
          <SecurityDashboard profile={profile} />
        )}
        {profile.role === 'admin' && (
          <AdminDashboard
            profile={profile}
            apartment={apartment}
            onApartmentUpdated={() => fetchApartmentById(profile.apartment_id)}
          />
        )}
      </main>
    </div>
  );
}

/* ==================== 1. AUTH SCREEN (WITH PHONE NUMBER & RESIDENT TYPE) ==================== */
function AuthScreen({ apartmentsList, refreshApartments }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [role, setRole] = useState('resident');
  const [residentType, setResidentType] = useState('owner');
  const [apartmentId, setApartmentId] = useState('');
  const [flatNumber, setFlatNumber] = useState('');
  const [loginMode, setLoginMode] = useState('standard');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    refreshApartments();
  }, []);

  useEffect(() => {
    if (apartmentsList.length > 0 && !apartmentId) {
      setApartmentId(apartmentsList[0].id);
    }
  }, [apartmentsList]);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage('');
    setLoading(true);

    if (isSignUp) {
      if (role !== 'dev' && !apartmentId) {
        setMessage('Please select your Apartment.');
        setLoading(false);
        return;
      }

      const cleanedPhone = normalizePhoneInput(phoneNumber);
      if (loginMode === 'standard' && cleanedPhone.length < 10) {
        setMessage('Please enter a valid 10-digit mobile number.');
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role,
            phone_number: cleanedPhone || null,
            apartment_id: role === 'dev' ? null : apartmentId,
            flat_number: role === 'resident' ? flatNumber.toUpperCase().trim() : null,
            resident_type: role === 'resident' ? residentType : null,
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-950 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl border border-indigo-100 p-6 sm:p-8">
        <div className="flex flex-col items-center justify-center mb-5">
          <div className="bg-gradient-to-tr from-indigo-600 to-violet-600 p-3 rounded-2xl text-white shadow-md mb-3">
            <Shield className="w-7 h-7" />
          </div>
          <span className="text-2xl font-extrabold text-slate-900 tracking-tight">GateMate</span>
          <span className="text-xs text-slate-500 mt-0.5 text-center">Multi-Apartment Gated Community Platform</span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl mb-5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setLoginMode('standard');
              if (role === 'dev') setRole('resident');
            }}
            className={`py-2 rounded-lg transition ${
              loginMode === 'standard' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
            }`}
          >
            Society Portal
          </button>
          <button
            type="button"
            onClick={() => {
              setLoginMode('dev');
              setRole('dev');
            }}
            className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition ${
              loginMode === 'dev' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600'
            }`}
          >
            <Crown className="w-3.5 h-3.5" />
            <span>Super User (Dev)</span>
          </button>
        </div>

        <h2 className="text-base font-semibold text-center text-slate-700 mb-4">
          {loginMode === 'dev'
            ? isSignUp
              ? 'Register Super User (Dev)'
              : 'Super User (Dev) Sign In'
            : isSignUp
            ? 'Create Society Account'
            : 'Sign in to your apartment'}
        </h2>

        {message && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {isSignUp && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={loginMode === 'dev' ? 'e.g. Dev Admin' : 'e.g. Swaraj Kumar'}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Mobile (WhatsApp)</label>
                  <input
                    type="tel"
                    required={loginMode === 'standard'}
                    maxLength={15}
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {loginMode === 'standard' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Select Apartment</label>
                    <select
                      required
                      value={apartmentId}
                      onChange={(e) => setApartmentId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      {apartmentsList.length === 0 && <option value="">No apartments created yet</option>}
                      {apartmentsList.map((apt) => (
                        <option key={apt.id} value={apt.id}>
                          {apt.name}
                        </option>
                      ))}
                    </select>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Resident Type</label>
                        <select
                          value={residentType}
                          onChange={(e) => setResidentType(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        >
                          <option value="owner">Owner</option>
                          <option value="family">Family Member</option>
                          <option value="tenant">Tenant</option>
                        </select>
                      </div>
                    </div>
                  )}
                </>
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
            className={`w-full py-2.5 text-white font-semibold rounded-lg transition text-sm shadow-md ${
              loginMode === 'dev'
                ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700'
                : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700'
            }`}
          >
            {loading ? 'Please wait...' : isSignUp ? 'Register Account' : 'Sign In'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-600">
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

/* ==================== 2. SUPER USER (DEV) DASHBOARD ==================== */
function SuperDevDashboard({ apartmentsList, refreshApartments }) {
  const [aptName, setAptName] = useState('');
  const [aptAddress, setAptAddress] = useState('');
  const [aptTagline, setAptTagline] = useState('Smart Society Portal');
  const [aptUpiId, setAptUpiId] = useState('');
  const [creatingApt, setCreatingApt] = useState(false);

  const [allProfiles, setAllProfiles] = useState([]);
  const [selectedAptForAdmin, setSelectedAptForAdmin] = useState('');

  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminPhone, setNewAdminPhone] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('');
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  useEffect(() => {
    fetchAllProfiles();
  }, []);

  useEffect(() => {
    if (apartmentsList.length > 0 && !selectedAptForAdmin) {
      setSelectedAptForAdmin(apartmentsList[0].id);
    }
  }, [apartmentsList]);

  async function fetchAllProfiles() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setAllProfiles(data);
  }

  async function handleCreateApartment(e) {
    e.preventDefault();
    setCreatingApt(true);
    const { data, error } = await supabase
      .from('apartments')
      .insert({
        name: aptName.trim(),
        address: aptAddress.trim() || null,
        tagline: aptTagline.trim() || 'Smart Society Portal',
        upi_id: aptUpiId.trim() || null,
      })
      .select()
      .single();

    if (error) {
      alert('Failed to create apartment: ' + error.message);
    } else {
      setAptName('');
      setAptAddress('');
      setAptUpiId('');
      await refreshApartments();
      if (data?.id) setSelectedAptForAdmin(data.id);
      alert(`Apartment "${data.name}" created! Now assign an Admin to it.`);
    }
    setCreatingApt(false);
  }

  async function handleCreateAdminAccount(e) {
    e.preventDefault();
    if (!selectedAptForAdmin) {
      alert('Please select an apartment first.');
      return;
    }
    setCreatingAdmin(true);

    const { data: currentSessionData } = await supabase.auth.getSession();
    const devSession = currentSessionData?.session;
    const cleanedPhone = normalizePhoneInput(newAdminPhone);

    const { data: signUpData, error } = await supabase.auth.signUp({
      email: newAdminEmail.trim(),
      password: newAdminPass,
      options: {
        data: {
          full_name: newAdminName.trim(),
          phone_number: cleanedPhone || null,
          role: 'admin',
          apartment_id: selectedAptForAdmin,
        },
      },
    });

    if (error) {
      alert('Error creating Admin account: ' + error.message);
    } else if (signUpData?.user) {
      await supabase.from('profiles').upsert({
        id: signUpData.user.id,
        full_name: newAdminName.trim(),
        phone_number: cleanedPhone || null,
        role: 'admin',
        apartment_id: selectedAptForAdmin,
        is_approved: true,
      });

      if (devSession) {
        await supabase.auth.setSession({
          access_token: devSession.access_token,
          refresh_token: devSession.refresh_token,
        });
      }

      alert(`RWA Admin "${newAdminName}" created and approved!`);
      setNewAdminName('');
      setNewAdminPhone('');
      setNewAdminEmail('');
      setNewAdminPass('');
      fetchAllProfiles();
    }
    setCreatingAdmin(false);
  }

  async function promoteUserToAdmin(userId, aptId) {
    if (!aptId) {
      alert('Select an apartment first.');
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update({ role: 'admin', apartment_id: aptId, is_approved: true })
      .eq('id', userId);
    if (error) alert(error.message);
    else {
      fetchAllProfiles();
      alert('User promoted to RWA Admin and approved!');
    }
  }

  async function approveAnyUser(user) {
    await supabase.from('profiles').update({ is_approved: true }).eq('id', user.id);
    if (user.phone_number) {
      sendApprovalWhatsApp(getAptName(user.apartment_id), user, user.is_flat_primary);
    }
    fetchAllProfiles();
  }

  const getAptName = (id) => apartmentsList.find((a) => a.id === id)?.name || 'Unassigned';

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 border-t-4 border-t-amber-500 space-y-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-amber-600" /> Add New Apartment / Society
          </h3>
          <form onSubmit={handleCreateApartment} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Apartment Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Loyalmates Heights"
                value={aptName}
                onChange={(e) => setAptName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Location / Address</label>
              <input
                type="text"
                placeholder="e.g. Kukatpally, Hyderabad"
                value={aptAddress}
                onChange={(e) => setAptAddress(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Portal Subtitle</label>
                <input
                  type="text"
                  value={aptTagline}
                  onChange={(e) => setAptTagline(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Society UPI ID</label>
                <input
                  type="text"
                  placeholder="e.g. societyrwa@sbi"
                  value={aptUpiId}
                  onChange={(e) => setAptUpiId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
            </div>
            <button
              disabled={creatingApt}
              className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg shadow-sm"
            >
              {creatingApt ? 'Creating Apartment...' : '+ Create Apartment'}
            </button>
          </form>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 border-t-4 border-t-indigo-600 space-y-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-indigo-600" /> Add Admin User to Apartment
          </h3>
          <form onSubmit={handleCreateAdminAccount} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Target Apartment</label>
              <select
                required
                value={selectedAptForAdmin}
                onChange={(e) => setSelectedAptForAdmin(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
              >
                <option value="">-- Select Apartment --</option>
                {apartmentsList.map((apt) => (
                  <option key={apt.id} value={apt.id}>
                    {apt.name} {apt.address ? `(${apt.address})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Admin Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Swaraj Admin"
                  value={newAdminName}
                  onChange={(e) => setNewAdminName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Admin Mobile</label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={newAdminPhone}
                  onChange={(e) => setNewAdminPhone(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Admin Email</label>
                <input
                  type="email"
                  required
                  placeholder="admin@society.com"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Min 6 chars"
                  value={newAdminPass}
                  onChange={(e) => setNewAdminPass(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
            </div>
            <button
              disabled={creatingAdmin}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm"
            >
              {creatingAdmin ? 'Creating Admin...' : 'Create & Approve RWA Admin'}
            </button>
          </form>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="font-bold text-slate-800 mb-3">Registered Apartments ({apartmentsList.length})</h3>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {apartmentsList.map((apt) => {
            const aptAdmins = allProfiles.filter((p) => p.apartment_id === apt.id && p.role === 'admin');
            const aptResidents = allProfiles.filter((p) => p.apartment_id === apt.id && p.role === 'resident');
            return (
              <div key={apt.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
                <p className="font-bold text-slate-900">{apt.name}</p>
                <p className="text-xs text-slate-500 mb-2">{apt.address || apt.tagline}</p>
                <div className="text-xs space-y-1 text-slate-700">
                  <p>
                    <strong>Admins:</strong>{' '}
                    {aptAdmins.length > 0 ? aptAdmins.map((a) => a.full_name).join(', ') : 'None assigned'}
                  </p>
                  <p>
                    <strong>UPI ID:</strong> {apt.upi_id || 'Not set'}
                  </p>
                  <p>
                    <strong>Residents:</strong> {aptResidents.length}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="font-bold text-slate-800 mb-3">All Platform Users ({allProfiles.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 border-b">
              <tr>
                <th className="p-2.5">Name</th>
                <th className="p-2.5">Phone</th>
                <th className="p-2.5">Role</th>
                <th className="p-2.5">Apartment</th>
                <th className="p-2.5">Flat</th>
                <th className="p-2.5">Status</th>
                <th className="p-2.5">Super User Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {allProfiles.map((u) => (
                <tr key={u.id}>
                  <td className="p-2.5 font-semibold text-slate-900">{u.full_name}</td>
                  <td className="p-2.5 font-mono">{u.phone_number || '—'}</td>
                  <td className="p-2.5 capitalize">
                    {u.role === 'resident' ? formatResidentTypeLabel(u.resident_type) : u.role}
                  </td>
                  <td className="p-2.5">{u.role === 'dev' ? 'All Apartments' : getAptName(u.apartment_id)}</td>
                  <td className="p-2.5">{u.flat_number || '—'}</td>
                  <td className="p-2.5">
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${u.is_approved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                      {u.is_approved ? 'Approved' : 'Pending'}
                    </span>
                  </td>
                  <td className="p-2.5 flex gap-2">
                    {!u.is_approved && (
                      <button
                        onClick={() => approveAnyUser(u)}
                        className="px-2.5 py-1 bg-emerald-600 text-white rounded font-semibold"
                      >
                        Approve
                      </button>
                    )}
                    {u.role !== 'admin' && u.role !== 'dev' && (
                      <button
                        onClick={() => promoteUserToAdmin(u.id, u.apartment_id || selectedAptForAdmin)}
                        className="px-2.5 py-1 bg-indigo-600 text-white rounded font-semibold"
                      >
                        Make Admin
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ==================== 3. RESIDENT DASHBOARD (DYNAMIC POLLS + PHONE NUMBERS + DOORBELL + UPI) ==================== */
function ResidentDashboard({ profile, apartment, onProfileUpdated }) {
  const amenitiesList = apartment?.amenities?.length ? apartment.amenities : DEFAULT_AMENITIES;
  const slotsList = apartment?.amenity_slots?.length ? apartment.amenity_slots : DEFAULT_SLOTS;
  const categoriesList = apartment?.helpdesk_categories?.length ? apartment.helpdesk_categories : DEFAULT_CATEGORIES;

  const [tab, setTab] = useState('gate');
  const [visitors, setVisitors] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [notices, setNotices] = useState([]);
  const [activePoll, setActivePoll] = useState(null);
  const [votes, setVotes] = useState([]);
  const [flatMembers, setFlatMembers] = useState([]);
  const [isRingingMuted, setIsRingingMuted] = useState(false);

  // Own Phone Number Inline Edit
  const [editingMyPhone, setEditingMyPhone] = useState(false);
  const [myPhoneDraft, setMyPhoneDraft] = useState(profile.phone_number || '');
  const [savingMyPhone, setSavingMyPhone] = useState(false);

  // UPI Payment Modal State
  const [activePayInvoice, setActivePayInvoice] = useState(null);
  const [utrInput, setUtrInput] = useState('');
  const [submittingUtr, setSubmittingUtr] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);

  const [vName, setVName] = useState('');
  const [vType, setVType] = useState('Guest');
  const [vVehicle, setVVehicle] = useState('');

  const [tCategory, setTCategory] = useState(categoriesList[0]);
  const [tDesc, setTDesc] = useState('');

  const [amenity, setAmenity] = useState(amenitiesList[0]);
  const [bDate, setBDate] = useState('');
  const [bSlot, setBSlot] = useState(slotsList[0]);

  useEffect(() => {
    setMyPhoneDraft(profile.phone_number || '');
  }, [profile.phone_number]);

  useEffect(() => {
    loadAllData();
    const channel = supabase
      .channel(`resident-gate-${profile.apartment_id}-${profile.flat_number}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'visitor_logs', filter: `flat_number=eq.${profile.flat_number}` },
        (payload) => {
          fetchVisitors();
          if (payload.new?.status === 'Pending') {
            setIsRingingMuted(false);
            playDoorbellChime();
            triggerAndroidGateNotification(payload.new);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'visitor_logs', filter: `flat_number=eq.${profile.flat_number}` },
        () => fetchVisitors()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [profile.flat_number, profile.apartment_id]);

  const pendingVisitors = visitors.filter((v) => v.status === 'Pending');

  useEffect(() => {
    if (pendingVisitors.length === 0) {
      setIsRingingMuted(false);
      return;
    }
    if (isRingingMuted) return;

    playDoorbellChime();
    const ringInterval = setInterval(() => {
      playDoorbellChime();
    }, 2800);

    return () => clearInterval(ringInterval);
  }, [pendingVisitors.length, isRingingMuted]);

  async function loadAllData() {
    fetchVisitors();
    fetchInvoices();
    fetchTickets();
    fetchBookings();
    fetchNotices();
    fetchActivePollAndVotes();
    fetchFlatMembers();
  }

  async function fetchFlatMembers() {
    if (!profile.apartment_id || !profile.flat_number) return;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('apartment_id', profile.apartment_id)
      .eq('flat_number', profile.flat_number)
      .order('created_at', { ascending: true });
    if (data) setFlatMembers(data);
  }

  async function saveMyPhoneNumber(e) {
    e.preventDefault();
    const cleaned = normalizePhoneInput(myPhoneDraft);
    if (cleaned.length < 10) {
      alert('Please enter a valid 10-digit mobile number.');
      return;
    }
    setSavingMyPhone(true);
    const { error } = await supabase
      .from('profiles')
      .update({ phone_number: cleaned })
      .eq('id', profile.id);

    if (error) {
      alert('Could not save phone number: ' + error.message);
    } else {
      setEditingMyPhone(false);
      await fetchFlatMembers();
      if (onProfileUpdated) onProfileUpdated();
    }
    setSavingMyPhone(false);
  }

  async function approveFlatMember(member) {
    const { error } = await supabase
      .from('profiles')
      .update({ is_approved: true })
      .eq('id', member.id)
      .eq('flat_number', profile.flat_number);
    if (error) alert('Could not approve member: ' + error.message);
    else {
      if (member.phone_number) {
        sendApprovalWhatsApp(apartment?.name, member, false);
      }
      fetchFlatMembers();
    }
  }

  async function removeFlatMember(member) {
    const confirmed = window.confirm(
      `Remove ${member.full_name} (${formatResidentTypeLabel(member.resident_type)}) from Flat ${profile.flat_number}?`
    );
    if (!confirmed) return;

    const { error } = await supabase
      .from('profiles')
      .update({ is_approved: false })
      .eq('id', member.id)
      .eq('flat_number', profile.flat_number);
    if (error) alert('Could not revoke access: ' + error.message);
    else fetchFlatMembers();
  }

  async function fetchVisitors() {
    const { data } = await supabase
      .from('visitor_logs')
      .select('*')
      .eq('apartment_id', profile.apartment_id)
      .eq('flat_number', profile.flat_number)
      .order('entry_time', { ascending: false });
    if (data) setVisitors(data);
  }

  async function fetchInvoices() {
    const { data } = await supabase
      .from('maintenance_invoices')
      .select('*')
      .eq('apartment_id', profile.apartment_id)
      .eq('flat_number', profile.flat_number)
      .order('created_at', { ascending: false });
    if (data) setInvoices(data);
  }

  async function fetchTickets() {
    const { data } = await supabase
      .from('helpdesk_tickets')
      .select('*')
      .eq('apartment_id', profile.apartment_id)
      .eq('flat_number', profile.flat_number)
      .order('created_at', { ascending: false });
    if (data) setTickets(data);
  }

  async function fetchBookings() {
    const { data } = await supabase
      .from('amenity_bookings')
      .select('*')
      .eq('apartment_id', profile.apartment_id)
      .order('booking_date', { ascending: true });
    if (data) setBookings(data);
  }

  async function fetchNotices() {
    const { data } = await supabase
      .from('notices')
      .select('*')
      .eq('apartment_id', profile.apartment_id)
      .order('created_at', { ascending: false });
    if (data) setNotices(data);
  }

  async function fetchActivePollAndVotes() {
    if (!profile.apartment_id) return;
    const { data: pollData } = await supabase
      .from('polls')
      .select('*')
      .eq('apartment_id', profile.apartment_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    setActivePoll(pollData || null);

    if (pollData?.id) {
      const { data: voteData } = await supabase
        .from('poll_votes')
        .select('*')
        .eq('apartment_id', profile.apartment_id)
        .eq('poll_id', pollData.id);
      if (voteData) setVotes(voteData);
    } else {
      setVotes([]);
    }
  }

  async function updateVisitorStatus(id, status) {
    await supabase.from('visitor_logs').update({ status }).eq('id', id);
    fetchVisitors();
  }

  async function createPreApproval(e) {
    e.preventDefault();
    const passcode = Math.floor(100000 + Math.random() * 900000).toString();
    await supabase.from('visitor_logs').insert({
      apartment_id: profile.apartment_id,
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

  function openUpiPaymentModal(invoice) {
    setActivePayInvoice(invoice);
    setUtrInput(invoice.razorpay_payment_id || '');
    setCopiedUpi(false);
  }

  function handleOpenUpiApp(invoice) {
    if (!apartment?.upi_id) {
      alert('Your RWA Admin has not configured the Society UPI ID yet. Please ask your Admin to add the UPI ID in Settings.');
      return;
    }
    const total = Number(invoice.base_amount) + Number(invoice.late_fee || 0);
    const upiUrl = buildUpiPaymentUrl({
      upiId: apartment.upi_id,
      payeeName: apartment.name,
      amount: total,
      flatNumber: profile.flat_number,
      billingMonth: invoice.billing_month,
    });
    launchUpiIntent(upiUrl);
  }

  async function handleCopyUpiId() {
    if (!apartment?.upi_id) return;
    try {
      await navigator.clipboard.writeText(apartment.upi_id);
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    } catch {
      alert('UPI ID: ' + apartment.upi_id);
    }
  }

  async function submitUpiUtr(e) {
    e.preventDefault();
    const cleanedUtr = utrInput.trim().toUpperCase();
    if (cleanedUtr.length < 6) {
      alert('Please enter a valid UPI Transaction / UTR Reference Number (at least 6 characters).');
      return;
    }
    setSubmittingUtr(true);

    const { error } = await supabase
      .from('maintenance_invoices')
      .update({
        status: 'Verification Pending',
        razorpay_payment_id: cleanedUtr,
        paid_at: new Date().toISOString(),
      })
      .eq('id', activePayInvoice.id);

    if (error) {
      alert('Failed to submit UTR: ' + error.message);
    } else {
      setActivePayInvoice(null);
      setUtrInput('');
      fetchInvoices();
      alert('UTR submitted! Your RWA Admin will verify the bank credit and mark your bill Paid.');
    }
    setSubmittingUtr(false);
  }

  async function submitTicket(e) {
    e.preventDefault();
    await supabase.from('helpdesk_tickets').insert({
      apartment_id: profile.apartment_id,
      flat_number: profile.flat_number,
      category: tCategory,
      description: tDesc,
    });
    setTDesc('');
    fetchTickets();
  }

  async function bookAmenity(e) {
    e.preventDefault();
    const sameDayBookings = bookings.filter((b) => b.amenity_name === amenity && b.booking_date === bDate);
    const isFullDayRequest = bSlot.toLowerCase().includes('full day');
    const hasFullDayBooked = sameDayBookings.some((b) => b.time_slot.toLowerCase().includes('full day'));
    const hasExactSlot = sameDayBookings.some((b) => b.time_slot === bSlot);

    if (hasFullDayBooked || hasExactSlot || (isFullDayRequest && sameDayBookings.length > 0)) {
      alert(`${amenity} is unavailable for "${bSlot}" on ${bDate} due to an existing booking.`);
      return;
    }

    const { error } = await supabase.from('amenity_bookings').insert({
      apartment_id: profile.apartment_id,
      amenity_name: amenity,
      booking_date: bDate,
      time_slot: bSlot,
      flat_number: profile.flat_number,
    });
    if (error) alert('This slot is already booked by another flat!');
    else fetchBookings();
  }

  async function castVote(option) {
    if (!activePoll?.id) return;
    const { error } = await supabase.from('poll_votes').insert({
      apartment_id: profile.apartment_id,
      poll_id: activePoll.id,
      flat_number: profile.flat_number,
      option_selected: option,
    });
    if (error) alert('Your flat has already voted in this poll.');
    else fetchActivePollAndVotes();
  }

  const myFlatVoted = votes.some((v) => v.flat_number === profile.flat_number);
  const canManageFlatMembers = Boolean(profile.is_flat_primary || profile.resident_type === 'owner');
  const approvedFlatMembers = flatMembers.filter((m) => m.is_approved);
  const pendingFlatMembers = flatMembers.filter((m) => !m.is_approved);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 2x2 Responsive Grid on Mobile, Single Row on Desktop */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 bg-white p-2 rounded-2xl shadow-sm border border-indigo-100">
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
              className={`w-full sm:w-auto flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold text-center transition ${
                tab === t.id
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                  : 'text-slate-600 bg-slate-50/70 sm:bg-transparent hover:bg-indigo-50 hover:text-indigo-700'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab === 'gate' && (
        <div className="grid md:grid-cols-3 gap-6">
          <div className="space-y-6 h-fit">
            {/* Pre-Approve Visitor Card */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-indigo-600">
              <div className="flex items-center justify-between gap-2 mb-4">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-indigo-600" /> Pre-Approve Visitor
                </h3>
                <button
                  type="button"
                  onClick={playDoorbellChime}
                  title="Test Doorbell Ring & Unlock Audio"
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg border border-indigo-200"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Test Ring</span>
                </button>
              </div>
              <form onSubmit={createPreApproval} className="space-y-3">
                <input type="text" required placeholder="Visitor / Delivery Name" value={vName} onChange={(e) => setVName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                <select value={vType} onChange={(e) => setVType(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                  <option value="Guest">Guest</option>
                  <option value="Delivery">Delivery</option>
                  <option value="Cab">Cab</option>
                  <option value="Service">Service / Maid</option>
                </select>
                <input type="text" maxLength={4} placeholder="Vehicle Last 4 Digits (Optional)" value={vVehicle} onChange={(e) => setVVehicle(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                <button className="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 shadow-sm">
                  Generate 6-Digit Entry Pass
                </button>
              </form>
            </div>

            {/* My Flat Members Approval & Management Card (With Phone Numbers) */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-violet-600 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                  <Home className="w-4 h-4 text-violet-600" /> My Flat ({profile.flat_number}) Members
                </h3>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800">
                  {approvedFlatMembers.length} Active
                </span>
              </div>

              {!profile.phone_number && !editingMyPhone && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-2 text-xs">
                  <span className="text-amber-900">Add your mobile number so Security & Admin can reach you on WhatsApp.</span>
                  <button
                    type="button"
                    onClick={() => setEditingMyPhone(true)}
                    className="shrink-0 px-2.5 py-1 bg-amber-600 text-white font-semibold rounded-lg"
                  >
                    Add Phone
                  </button>
                </div>
              )}

              {editingMyPhone && (
                <form onSubmit={saveMyPhoneNumber} className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center gap-1.5">
                  <input
                    type="tel"
                    required
                    maxLength={15}
                    placeholder="10-digit mobile number"
                    value={myPhoneDraft}
                    onChange={(e) => setMyPhoneDraft(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-indigo-300 rounded-lg text-xs font-mono"
                  />
                  <button
                    type="submit"
                    disabled={savingMyPhone}
                    className="px-2.5 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg shrink-0"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingMyPhone(false)}
                    className="p-1.5 text-slate-500 hover:text-slate-800 shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </form>
              )}

              {canManageFlatMembers && pendingFlatMembers.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                  <p className="text-[11px] font-bold uppercase text-amber-900">
                    Pending Household Requests ({pendingFlatMembers.length})
                  </p>
                  {pendingFlatMembers.map((m) => (
                    <div key={m.id} className="bg-white p-2.5 rounded-lg border border-amber-200 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate">{m.full_name}</p>
                        <p className="text-[11px] text-slate-500">
                          {formatResidentTypeLabel(m.resident_type)}
                          {m.phone_number ? ` • ${m.phone_number}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => approveFlatMember(m)}
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Approve</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="divide-y divide-slate-100">
                {approvedFlatMembers.map((m) => (
                  <div key={m.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">
                        {m.full_name} {m.id === profile.id ? <span className="text-slate-400 font-normal">(You)</span> : ''}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span className={`px-2 py-0.2 rounded-full text-[10px] font-semibold ${
                          m.resident_type === 'tenant'
                            ? 'bg-amber-100 text-amber-800'
                            : m.resident_type === 'family'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}>
                          {formatResidentTypeLabel(m.resident_type)}
                        </span>
                        {m.is_flat_primary && (
                          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Primary
                          </span>
                        )}
                        {m.phone_number ? (
                          <a
                            href={`tel:${m.phone_number}`}
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-indigo-700 hover:underline"
                          >
                            <Phone className="w-3 h-3" />
                            <span>{m.phone_number}</span>
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-400">No phone</span>
                        )}
                        {m.id === profile.id && (
                          <button
                            type="button"
                            onClick={() => setEditingMyPhone(true)}
                            title="Edit My Phone Number"
                            className="p-0.5 text-slate-400 hover:text-indigo-600"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {canManageFlatMembers && m.id !== profile.id && !m.is_flat_primary && (
                      <button
                        type="button"
                        onClick={() => removeFlatMember(m)}
                        title="Revoke Flat Access"
                        className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-red-600 hover:bg-red-50 border border-red-200 rounded-lg font-medium"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 pt-1">
                Family members & tenants can sign up using Flat <strong>{profile.flat_number}</strong> to share gate alerts & bills.
              </p>
            </div>
          </div>

          <div className="md:col-span-2 space-y-4">
            {pendingVisitors.length > 0 && (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-400 rounded-2xl p-4 shadow-md">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h4 className="font-bold text-amber-950 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 animate-bounce" /> Waiting at Main Gate ({pendingVisitors.length})
                  </h4>
                  <button
                    type="button"
                    onClick={() => setIsRingingMuted(!isRingingMuted)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border transition ${
                      isRingingMuted
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    {isRingingMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    <span>{isRingingMuted ? 'Unmute Ring' : 'Mute Ring'}</span>
                  </button>
                </div>
                <div className="space-y-3">
                  {pendingVisitors.map((v) => (
                    <div key={v.id} className="bg-white p-3.5 rounded-xl border border-amber-200 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                      <div className="flex items-center gap-3">
                        {v.visitor_photo && <img src={v.visitor_photo} alt={v.visitor_name} className="w-14 h-14 rounded-xl object-cover border border-slate-200 shrink-0" />}
                        <div>
                          <p className="font-semibold text-slate-900">
                            {v.visitor_name} <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-medium">{v.visitor_type}</span>
                          </p>
                          <p className="text-xs text-slate-500">Vehicle: {v.vehicle_last4 || 'None'} • Waiting at gate</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 sm:flex gap-2 w-full sm:w-auto">
                        <button onClick={() => updateVisitorStatus(v.id, 'Approved')} className="px-2.5 py-2 sm:py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg text-center">Approve</button>
                        <button onClick={() => updateVisitorStatus(v.id, 'Leave-at-Gate')} className="px-2.5 py-2 sm:py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-lg text-center">Leave at Gate</button>
                        <button onClick={() => updateVisitorStatus(v.id, 'Denied')} className="px-2.5 py-2 sm:py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg text-center">Deny</button>
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
                    <div className="flex items-center gap-3 min-w-0">
                      {v.visitor_photo && <img src={v.visitor_photo} alt={v.visitor_name} className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0" />}
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-slate-900 truncate">
                          {v.visitor_name} <span className="text-xs text-slate-500">({v.visitor_type})</span>
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {v.passcode ? `Passcode: ${v.passcode} • ` : ''}{new Date(v.entry_time).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
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
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-emerald-500 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="font-bold text-slate-800">Maintenance Invoices — Flat {profile.flat_number}</h3>
              {apartment?.upi_id && (
                <p className="text-xs text-slate-500 mt-0.5">
                  Society UPI ID: <span className="font-mono font-semibold text-indigo-700">{apartment.upi_id}</span> (Zero Gateway Fee)
                </p>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 border-b">
                <tr>
                  <th className="p-3">Month</th>
                  <th className="p-3">Base</th>
                  <th className="p-3">Late Fee</th>
                  <th className="p-3">Total</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoices.length === 0 && <tr><td colSpan={6} className="p-4 text-slate-500 text-center">No invoices generated yet.</td></tr>}
                {invoices.map((inv) => {
                  const total = Number(inv.base_amount) + Number(inv.late_fee || 0);
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/70">
                      <td className="p-3 font-medium whitespace-nowrap">{inv.billing_month}</td>
                      <td className="p-3">₹{inv.base_amount}</td>
                      <td className="p-3">₹{inv.late_fee || 0}</td>
                      <td className="p-3 font-bold text-slate-900">₹{total}</td>
                      <td className="p-3 whitespace-nowrap">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          inv.status === 'Paid'
                            ? 'bg-emerald-100 text-emerald-700'
                            : inv.status === 'Verification Pending'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {inv.status === 'Paid' ? (
                          <span className="text-xs text-slate-500 font-mono">UTR: {inv.razorpay_payment_id}</span>
                        ) : inv.status === 'Verification Pending' ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-sky-700 font-mono">UTR: {inv.razorpay_payment_id}</span>
                            <button
                              onClick={() => openUpiPaymentModal(inv)}
                              className="text-xs text-indigo-600 underline font-medium"
                            >
                              Edit
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => openUpiPaymentModal(inv)}
                            className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 shadow-sm"
                          >
                            Pay ₹{total} via UPI
                          </button>
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

      {/* Direct Society UPI Payment & UTR Submission Modal */}
      {activePayInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Pay Society Maintenance</h3>
                <p className="text-xs text-slate-500">
                  Flat {profile.flat_number} • {activePayInvoice.billing_month}
                </p>
              </div>
              <button
                onClick={() => setActivePayInvoice(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-emerald-900 uppercase">Amount Payable</span>
                <span className="text-xl font-extrabold text-emerald-700">
                  ₹{Number(activePayInvoice.base_amount) + Number(activePayInvoice.late_fee || 0)}
                </span>
              </div>

              <div className="pt-2 border-t border-emerald-200/80 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-emerald-800 uppercase">Society UPI ID</p>
                  <p className="text-sm font-mono font-bold text-slate-900 truncate">
                    {apartment?.upi_id || 'Not configured by Admin yet'}
                  </p>
                </div>
                {apartment?.upi_id && (
                  <button
                    type="button"
                    onClick={handleCopyUpiId}
                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-emerald-300 text-emerald-800 text-xs font-semibold rounded-lg hover:bg-emerald-100"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedUpi ? 'Copied!' : 'Copy'}</span>
                  </button>
                )}
              </div>
            </div>

            <button
              type="button"
              disabled={!apartment?.upi_id}
              onClick={() => handleOpenUpiApp(activePayInvoice)}
              className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl shadow-md flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open UPI App (GPay / PhonePe / Paytm)</span>
            </button>

            <form onSubmit={submitUpiUtr} className="pt-3 border-t border-slate-200 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Step 2: Enter 12-Digit UPI UTR / Ref No.
                </label>
                <input
                  type="text"
                  required
                  minLength={6}
                  maxLength={30}
                  placeholder="e.g. 433219847561"
                  value={utrInput}
                  onChange={(e) => setUtrInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  After completing payment in your UPI app, paste the UPI Reference / UTR number above for RWA verification.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActivePayInvoice(null)}
                  className="flex-1 py-2.5 border border-slate-300 text-slate-700 text-xs sm:text-sm font-semibold rounded-xl hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingUtr}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-sm"
                >
                  {submittingUtr ? 'Submitting...' : 'Submit UTR for Approval'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {tab === 'helpdesk' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-amber-500 space-y-4">
            <h3 className="font-bold text-slate-800">Raise Helpdesk Complaint</h3>
            <form onSubmit={submitTicket} className="space-y-3">
              <select value={tCategory} onChange={(e) => setTCategory(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                {categoriesList.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <textarea required rows={2} placeholder="Describe the issue..." value={tDesc} onChange={(e) => setTDesc(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
              <button className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">Submit Ticket</button>
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

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-violet-500 space-y-4">
            <h3 className="font-bold text-slate-800">Book Community Amenity</h3>
            <form onSubmit={bookAmenity} className="space-y-3">
              <select value={amenity} onChange={(e) => setAmenity(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                {amenitiesList.map((am) => <option key={am} value={am}>{am}</option>)}
              </select>
              <input type="date" required value={bDate} onChange={(e) => setBDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
              <select value={bSlot} onChange={(e) => setBSlot(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                {slotsList.map((sl) => <option key={sl} value={sl}>{sl}</option>)}
              </select>
              <button className="px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700">Reserve Slot</button>
            </form>
            <div className="pt-4 border-t space-y-2">
              <h4 className="text-xs font-bold uppercase text-slate-500">Upcoming Society Bookings</h4>
              {bookings.map((b) => (
                <div key={b.id} className="p-2.5 bg-slate-50 rounded-xl text-xs flex justify-between gap-2">
                  <span className="font-semibold text-indigo-700">{b.amenity_name} ({b.flat_number})</span>
                  <span className="text-slate-600 text-right">{b.booking_date} • {b.time_slot}</span>
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
              <div key={n.id} className="p-3.5 rounded-xl border border-sky-100 bg-sky-50/40 space-y-2">
                <div className="flex justify-between items-center gap-2">
                  <h4 className="font-bold text-sm text-slate-900">{n.title}</h4>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold shrink-0">{n.priority}</span>
                </div>
                <p className="text-xs text-slate-600">{n.body}</p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => shareNoticeToWhatsApp(apartment?.name, n.title, n.body)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg"
                  >
                    <Share2 className="w-3 h-3" />
                    <span>Share on WhatsApp</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-emerald-500 space-y-4 h-fit">
            <h3 className="font-bold text-slate-800">Active Community Poll</h3>
            {!activePoll ? (
              <p className="text-sm text-slate-500">No active poll published by your RWA Admin right now.</p>
            ) : (
              <>
                <p className="text-sm text-slate-700 font-medium">{activePoll.question}</p>
                <div className="space-y-2">
                  {(activePoll.options || []).map((opt) => {
                    const count = votes.filter((v) => v.option_selected === opt).length;
                    return (
                      <button
                        key={opt}
                        disabled={myFlatVoted}
                        onClick={() => castVote(opt)}
                        className="w-full p-3 rounded-xl border border-slate-200 hover:border-indigo-500 flex justify-between items-center text-sm disabled:opacity-75"
                      >
                        <span className="font-medium">{opt}</span>
                        <span className="font-bold text-indigo-600">{count} votes</span>
                      </button>
                    );
                  })}
                </div>
                {myFlatVoted && (
                  <p className="text-xs text-emerald-600 font-semibold">✓ Flat {profile.flat_number} has voted.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== 4. SECURITY GUARD DASHBOARD (REGISTERED FLAT DROPDOWN + ONE-TAP CALL) ==================== */
function SecurityDashboard({ profile }) {
  const [visitors, setVisitors] = useState([]);
  const [registeredFlats, setRegisteredFlats] = useState([]);
  const [otpInput, setOtpInput] = useState('');
  const [vName, setVName] = useState('');
  const [vType, setVType] = useState('Delivery');
  const [flatNo, setFlatNo] = useState('');
  const [isManualFlat, setIsManualFlat] = useState(false);
  const [vehicle, setVehicle] = useState('');
  const [photoData, setPhotoData] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchVisitors();
    fetchRegisteredFlats();
    const channel = supabase
      .channel(`guard-gate-${profile.apartment_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visitor_logs' }, () => fetchVisitors())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [profile.apartment_id]);

  async function fetchRegisteredFlats() {
    if (!profile.apartment_id) return;

    const [{ data: resData }, { data: invData }] = await Promise.all([
      supabase
        .from('profiles')
        .select('flat_number, full_name, phone_number, resident_type, is_flat_primary')
        .eq('apartment_id', profile.apartment_id)
        .eq('role', 'resident')
        .eq('is_approved', true),
      supabase
        .from('maintenance_invoices')
        .select('flat_number')
        .eq('apartment_id', profile.apartment_id),
    ]);

    const grouped = new Map();

    (resData || []).forEach((row) => {
      if (!row.flat_number) return;
      const flatKey = row.flat_number.toUpperCase().trim();
      if (!grouped.has(flatKey)) grouped.set(flatKey, []);
      grouped.get(flatKey).push(row);
    });

    (invData || []).forEach((row) => {
      if (!row.flat_number) return;
      const flatKey = row.flat_number.toUpperCase().trim();
      if (!grouped.has(flatKey)) grouped.set(flatKey, []);
    });

    const list = Array.from(grouped.entries())
      .map(([flat, members]) => {
        members.sort((a, b) => Number(Boolean(b.is_flat_primary)) - Number(Boolean(a.is_flat_primary)));
        const names = members.length > 0 ? members.map((m) => m.full_name).join(', ') : 'Registered Flat';
        return { flat, names, members };
      })
      .sort((a, b) => a.flat.localeCompare(b.flat, undefined, { numeric: true }));

    setRegisteredFlats(list);
    if (list.length > 0) {
      setIsManualFlat(false);
      setFlatNo((prev) => prev || list[0].flat);
    }
  }

  async function fetchVisitors() {
    const { data } = await supabase
      .from('visitor_logs')
      .select('*')
      .eq('apartment_id', profile.apartment_id)
      .order('entry_time', { ascending: false })
      .limit(30);
    if (data) setVisitors(data);
  }

  async function handleTakePhoto() {
    try {
      const image = await CapCamera.getPhoto({
        quality: 70,
        width: 480,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });
      if (image.dataUrl) {
        setPhotoData(image.dataUrl);
      }
    } catch (err) {
      console.warn('Camera cancelled or unavailable:', err);
    }
  }

  async function verifyOtp(e) {
    e.preventDefault();
    const { data } = await supabase
      .from('visitor_logs')
      .select('*')
      .eq('apartment_id', profile.apartment_id)
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
    if (!flatNo.trim()) {
      alert('Please select or enter a valid Flat Number.');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('visitor_logs').insert({
      apartment_id: profile.apartment_id,
      visitor_name: vName,
      visitor_type: vType,
      flat_number: flatNo.toUpperCase().trim(),
      vehicle_last4: vehicle || null,
      visitor_photo: photoData || null,
      status: 'Pending',
      logged_by: profile.id,
    });
    if (error) alert('Error logging visitor: ' + error.message);
    else {
      setVName('');
      if (isManualFlat && registeredFlats.length > 0) {
        setIsManualFlat(false);
        setFlatNo(registeredFlats[0].flat);
      }
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

  const selectedFlatObj = registeredFlats.find(
    (item) => item.flat === flatNo.toUpperCase().trim()
  );

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <div className="space-y-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-emerald-500">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-emerald-600" /> Verify 6-Digit Passcode
          </h3>
          <form onSubmit={verifyOtp} className="flex gap-2">
            <input type="text" maxLength={6} required placeholder="Enter 6-digit OTP" value={otpInput} onChange={(e) => setOtpInput(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tracking-widest" />
            <button className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg">Verify</button>
          </form>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-indigo-600">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4 text-indigo-600" /> New Gate Entry Request
          </h3>
          <form onSubmit={logSpotVisitor} className="space-y-3">
            <input type="text" required placeholder="Visitor Name" value={vName} onChange={(e) => setVName(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />

            {/* Registered Flat Dropdown + Manual Fallback */}
            {!isManualFlat ? (
              <div className="space-y-2">
                <select
                  required
                  value={flatNo}
                  onChange={(e) => {
                    if (e.target.value === '__MANUAL__') {
                      setIsManualFlat(true);
                      setFlatNo('');
                    } else {
                      setFlatNo(e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white font-medium text-slate-800"
                >
                  <option value="" disabled>
                    {registeredFlats.length === 0 ? '-- No approved flats found --' : '-- Select Registered Flat --'}
                  </option>
                  {registeredFlats.map((item) => (
                    <option key={item.flat} value={item.flat}>
                      Flat {item.flat} — {item.names}
                    </option>
                  ))}
                  <option value="__MANUAL__">+ Enter flat number manually...</option>
                </select>

                {/* One-Tap Intercom Voice Call Strip for Selected Flat */}
                {selectedFlatObj && selectedFlatObj.members.some((m) => m.phone_number) && (
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <p className="text-[10px] font-bold uppercase text-slate-500">
                      Flat {selectedFlatObj.flat} Intercom / Direct Call
                    </p>
                    {selectedFlatObj.members
                      .filter((m) => m.phone_number)
                      .map((m, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-700 font-medium truncate">
                            {m.full_name} ({formatResidentTypeLabel(m.resident_type)})
                          </span>
                          <a
                            href={`tel:${m.phone_number}`}
                            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded-lg"
                          >
                            <Phone className="w-3 h-3" />
                            <span>Call</span>
                          </a>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <input
                  type="text"
                  required
                  placeholder="Flat Number (e.g. B-402)"
                  value={flatNo}
                  onChange={(e) => setFlatNo(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    setIsManualFlat(false);
                    setFlatNo(registeredFlats[0]?.flat || '');
                  }}
                  className="text-xs text-indigo-600 font-semibold hover:underline"
                >
                  ← Back to flats dropdown
                </button>
              </div>
            )}

            <select value={vType} onChange={(e) => setVType(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
              <option value="Delivery">Delivery</option>
              <option value="Guest">Guest</option>
              <option value="Cab">Cab</option>
              <option value="Service">Service</option>
            </select>
            <input type="text" maxLength={4} placeholder="Vehicle Last 4 Digits" value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />

            <div>
              {photoData ? (
                <div className="relative w-full">
                  <img src={photoData} alt="Visitor preview" className="w-full h-36 object-cover rounded-xl border border-slate-300" />
                  <button type="button" onClick={() => setPhotoData(null)} className="absolute top-2 right-2 bg-red-600 text-white text-xs px-2.5 py-1 rounded-lg shadow">
                    Retake
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleTakePhoto}
                  className="flex items-center justify-center gap-2 w-full py-2.5 px-3 border-2 border-dashed border-indigo-200 bg-indigo-50/40 rounded-xl text-sm font-medium text-indigo-700 hover:border-indigo-500 transition"
                >
                  <Camera className="w-4 h-4" />
                  <span>Click Visitor Photo</span>
                </button>
              )}
            </div>

            <button disabled={submitting} className="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 shadow-sm">
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
                {v.visitor_photo && <img src={v.visitor_photo} alt={v.visitor_name} className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0" />}
                <div>
                  <p className="font-semibold text-sm">{v.visitor_name} → <span className="text-indigo-600">Flat {v.flat_number}</span></p>
                  <p className="text-xs text-slate-500">{v.visitor_type} • Vehicle: {v.vehicle_last4 || 'N/A'} • {new Date(v.entry_time).toLocaleTimeString()}</p>
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
                {v.status === 'Approved' && <button onClick={() => changeStatus(v.id, 'Checked-In')} className="px-2.5 py-1 bg-indigo-600 text-white text-xs rounded-lg">Check In</button>}
                {v.status === 'Checked-In' && <button onClick={() => changeStatus(v.id, 'Checked-Out')} className="px-2.5 py-1 bg-slate-800 text-white text-xs rounded-lg">Check Out</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ==================== 5. ADMIN DASHBOARD (POLL MANAGEMENT + WHATSAPP APPROVAL + UPI) ==================== */
function AdminDashboard({ profile, apartment, onApartmentUpdated }) {
  const amenitiesList = apartment?.amenities?.length ? apartment.amenities : DEFAULT_AMENITIES;
  const slotsList = apartment?.amenity_slots?.length ? apartment.amenity_slots : DEFAULT_SLOTS;
  const categoriesList = apartment?.helpdesk_categories?.length ? apartment.helpdesk_categories : DEFAULT_CATEGORIES;

  const [users, setUsers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [notices, setNotices] = useState([]);

  // Community Polls Management State
  const [polls, setPolls] = useState([]);
  const [pollVotes, setPollVotes] = useState([]);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptionsInput, setPollOptionsInput] = useState('Yes, Approve, No, Defer, Need More Quotes');
  const [creatingPoll, setCreatingPoll] = useState(false);

  const [billingMode, setBillingMode] = useState('bulk');
  const [invFlat, setInvFlat] = useState('');
  const [extraFlats, setExtraFlats] = useState('');
  const [invMonth, setInvMonth] = useState('December 2026');
  const [invAmount, setInvAmount] = useState('3500');
  const [sendingInv, setSendingInv] = useState(false);

  const [nTitle, setNTitle] = useState('');
  const [nBody, setNBody] = useState('');

  const [editUpiId, setEditUpiId] = useState(apartment?.upi_id || '');
  const [editAmenities, setEditAmenities] = useState(amenitiesList.join(', '));
  const [editSlots, setEditSlots] = useState(slotsList.join(', '));
  const [editCategories, setEditCategories] = useState(categoriesList.join(', '));
  const [savingOptions, setSavingOptions] = useState(false);

  useEffect(() => {
    setEditUpiId(apartment?.upi_id || '');
    setEditAmenities(amenitiesList.join(', '));
    setEditSlots(slotsList.join(', '));
    setEditCategories(categoriesList.join(', '));
  }, [apartment]);

  useEffect(() => {
    if (profile?.apartment_id) {
      fetchUsers();
      fetchInvoices();
      fetchTickets();
      fetchNotices();
      fetchPolls();
    }
  }, [profile?.apartment_id]);

  async function fetchUsers() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('apartment_id', profile.apartment_id)
      .order('created_at', { ascending: false });
    if (data) setUsers(data);
  }

  async function fetchInvoices() {
    const { data } = await supabase
      .from('maintenance_invoices')
      .select('*')
      .eq('apartment_id', profile.apartment_id)
      .order('created_at', { ascending: false });
    if (data) setInvoices(data);
  }

  async function fetchTickets() {
    const { data } = await supabase
      .from('helpdesk_tickets')
      .select('*')
      .eq('apartment_id', profile.apartment_id)
      .order('created_at', { ascending: false });
    if (data) setTickets(data);
  }

  async function fetchNotices() {
    const { data } = await supabase
      .from('notices')
      .select('*')
      .eq('apartment_id', profile.apartment_id)
      .order('created_at', { ascending: false });
    if (data) setNotices(data);
  }

  async function fetchPolls() {
    const [{ data: pData }, { data: vData }] = await Promise.all([
      supabase
        .from('polls')
        .select('*')
        .eq('apartment_id', profile.apartment_id)
        .order('created_at', { ascending: false }),
      supabase
        .from('poll_votes')
        .select('*')
        .eq('apartment_id', profile.apartment_id),
    ]);
    if (pData) setPolls(pData);
    if (vData) setPollVotes(vData);
  }

  async function createCommunityPoll(e) {
    e.preventDefault();
    const parsedOptions = pollOptionsInput.split(',').map((s) => s.trim()).filter(Boolean);
    if (!pollQuestion.trim() || parsedOptions.length < 2) {
      alert('Enter a poll question and at least 2 comma-separated options.');
      return;
    }
    setCreatingPoll(true);

    // Deactivate older active polls so the new poll becomes the active one
    await supabase
      .from('polls')
      .update({ is_active: false })
      .eq('apartment_id', profile.apartment_id)
      .eq('is_active', true);

    const { error } = await supabase.from('polls').insert({
      apartment_id: profile.apartment_id,
      question: pollQuestion.trim(),
      options: parsedOptions,
      is_active: true,
    });

    if (error) {
      alert('Failed to publish poll: ' + error.message);
    } else {
      setPollQuestion('');
      fetchPolls();
      alert('Community poll published to all residents!');
    }
    setCreatingPoll(false);
  }

  async function closeCommunityPoll(pollId) {
    await supabase.from('polls').update({ is_active: false }).eq('id', pollId);
    fetchPolls();
  }

  async function approveUser(userToApprove) {
    let promotePrimary = userToApprove.is_flat_primary;
    if (userToApprove.role === 'resident' && userToApprove.flat_number && userToApprove.resident_type === 'owner') {
      const hasApprovedPrimary = users.some(
        (u) =>
          u.id !== userToApprove.id &&
          u.flat_number === userToApprove.flat_number &&
          u.is_approved &&
          u.is_flat_primary
      );
      if (!hasApprovedPrimary) promotePrimary = true;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ is_approved: true, is_flat_primary: promotePrimary })
      .eq('id', userToApprove.id);

    if (error) {
      alert('Failed to approve account: ' + error.message);
      return;
    }

    await fetchUsers();

    if (userToApprove.phone_number) {
      sendApprovalWhatsApp(apartment?.name, userToApprove, promotePrimary);
    }
  }

  async function verifyUpiPayment(invoiceId) {
    const { error } = await supabase
      .from('maintenance_invoices')
      .update({
        status: 'Paid',
        paid_at: new Date().toISOString(),
      })
      .eq('id', invoiceId);

    if (error) alert('Error verifying payment: ' + error.message);
    else fetchInvoices();
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
      .from('apartments')
      .update({
        upi_id: editUpiId.trim() || null,
        amenities: parsedAmenities,
        amenity_slots: parsedSlots,
        helpdesk_categories: parsedCategories,
      })
      .eq('id', profile.apartment_id);

    if (error) alert('Failed to update settings: ' + error.message);
    else {
      await onApartmentUpdated();
      alert('Society UPI ID, Amenities, Slots, and Helpdesk options updated!');
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
      const manualFlats = extraFlats.split(',').map((f) => f.toUpperCase().trim()).filter(Boolean);
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
        apartment_id: profile.apartment_id,
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
    if (error) alert('Error creating invoices: ' + error.message);
    else {
      alert(`Sent ${rowsToInsert.length} invoice(s) for ${invMonth}!`);
      setInvFlat('');
      setExtraFlats('');
      fetchInvoices();
    }
    setSendingInv(false);
  }

  async function publishNotice(e) {
    e.preventDefault();
    const { error } = await supabase.from('notices').insert({
      apartment_id: profile.apartment_id,
      title: nTitle,
      body: nBody,
      priority: 'Important',
    });
    if (error) {
      alert('Failed to publish notice: ' + error.message);
      return;
    }
    setNTitle('');
    setNBody('');
    fetchNotices();
    alert('Notice published to all residents in your apartment!');
  }

  async function resolveTicket(id) {
    await supabase.from('helpdesk_tickets').update({ status: 'Resolved' }).eq('id', id);
    fetchTickets();
  }

  const pendingUsers = users.filter((u) => !u.is_approved);
  const verifiedUsers = users.filter((u) => u.is_approved);
  const pendingUpiVerifications = invoices.filter((i) => i.status === 'Verification Pending');

  return (
    <div className="space-y-6">
      {/* UPI Payment Verification Queue */}
      {pendingUpiVerifications.length > 0 && (
        <div className="bg-gradient-to-r from-sky-50 to-indigo-50 p-5 rounded-2xl shadow-sm border border-sky-300">
          <h3 className="font-bold text-sky-950 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-sky-600" /> UPI Payments Awaiting Verification ({pendingUpiVerifications.length})
          </h3>
          <div className="space-y-2.5">
            {pendingUpiVerifications.map((inv) => (
              <div key={inv.id} className="bg-white p-3.5 rounded-xl border border-sky-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-sm text-slate-900">
                    Flat {inv.flat_number} • {inv.billing_month} • ₹{Number(inv.base_amount) + Number(inv.late_fee || 0)}
                  </p>
                  <p className="text-xs text-slate-600 font-mono">
                    Submitted UPI UTR: <span className="font-bold text-indigo-700">{inv.razorpay_payment_id}</span>
                  </p>
                </div>
                <button
                  onClick={() => verifyUpiPayment(inv.id)}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm"
                >
                  Verify & Mark Paid
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-indigo-600">
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-600" /> User Verification Queue ({pendingUsers.length} Pending)
        </h3>
        {pendingUsers.length === 0 ? (
          <p className="text-sm text-slate-500">All registered users in this apartment are verified.</p>
        ) : (
          <div className="divide-y">
            {pendingUsers.map((u) => (
              <div key={u.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm text-slate-900">{u.full_name}</p>
                  <p className="text-xs text-slate-500 capitalize">
                    Role:{' '}
                    <span className="font-medium text-indigo-600">
                      {u.role === 'resident' ? formatResidentTypeLabel(u.resident_type) : u.role}
                    </span>{' '}
                    {u.flat_number ? `• Flat ${u.flat_number}` : ''}
                    {u.phone_number ? ` • ${u.phone_number}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => approveUser(u)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 shrink-0 shadow-sm"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>{u.phone_number ? 'Approve & Send WhatsApp' : 'Approve Account'}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-emerald-500 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" /> Maintenance Billing
            </h3>
            <div className="flex bg-slate-100 p-1 rounded-lg text-xs font-semibold">
              <button type="button" onClick={() => setBillingMode('bulk')} className={`px-2.5 py-1 rounded-md transition ${billingMode === 'bulk' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600'}`}>
                All Flats (Bulk)
              </button>
              <button type="button" onClick={() => setBillingMode('single')} className={`px-2.5 py-1 rounded-md transition ${billingMode === 'single' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600'}`}>
                Single Flat
              </button>
            </div>
          </div>

          {!apartment?.upi_id && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              Tip: Set your <strong>Society UPI ID</strong> in the settings box below so residents can pay bills directly via GPay / PhonePe / Paytm.
            </div>
          )}

          <form onSubmit={handleGenerateInvoice} className="space-y-3">
            {billingMode === 'bulk' ? (
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                <p className="text-xs text-emerald-900 font-medium">
                  Detected Flats ({knownFlats.length}): <span className="font-bold">{knownFlats.length > 0 ? knownFlats.join(', ') : 'None yet'}</span>
                </p>
                <input type="text" placeholder="Add extra flats (optional, e.g. 102, 201)" value={extraFlats} onChange={(e) => setExtraFlats(e.target.value)} className="w-full px-3 py-1.5 bg-white border border-emerald-300 rounded-lg text-xs" />
              </div>
            ) : (
              <input type="text" required placeholder="Flat Number (e.g. B-402)" value={invFlat} onChange={(e) => setInvFlat(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Billing Month</label>
                <input type="text" required value={invMonth} onChange={(e) => setInvMonth(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Amount (₹)</label>
                <input type="number" required value={invAmount} onChange={(e) => setInvAmount(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
            </div>

            <button disabled={sendingInv} className={`w-full py-2.5 text-white text-sm font-semibold rounded-lg shadow-sm ${billingMode === 'bulk' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
              {sendingInv ? 'Generating Invoices...' : billingMode === 'bulk' ? 'Raise Bulk Invoices for All Flats' : 'Send Single Invoice'}
            </button>
          </form>

          <div className="pt-3 border-t space-y-2 max-h-52 overflow-y-auto">
            {invoices.map((i) => (
              <div key={i.id} className="text-xs flex justify-between items-center p-2.5 bg-slate-50 rounded-xl border border-slate-100 gap-2">
                <div>
                  <span><strong className="text-slate-900">Flat {i.flat_number}</strong> • {i.billing_month} (₹{i.base_amount})</span>
                  {i.razorpay_payment_id && <p className="text-[11px] font-mono text-slate-500">UTR: {i.razorpay_payment_id}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {i.status === 'Verification Pending' && (
                    <button
                      onClick={() => verifyUpiPayment(i.id)}
                      className="px-2 py-0.5 bg-emerald-600 text-white rounded font-semibold"
                    >
                      Approve
                    </button>
                  )}
                  <span className={`px-2 py-0.5 rounded-full font-bold ${
                    i.status === 'Paid'
                      ? 'bg-emerald-100 text-emerald-700'
                      : i.status === 'Verification Pending'
                      ? 'bg-sky-100 text-sky-800'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {i.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-sky-500 space-y-4">
            <h3 className="font-bold text-slate-800">Publish Society Notice</h3>
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
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="submit"
                  className="py-2 px-3 bg-sky-600 hover:bg-sky-700 text-white text-xs sm:text-sm font-semibold rounded-lg shadow-sm"
                >
                  Publish Notice
                </button>
                <button
                  type="button"
                  disabled={!nTitle.trim() || !nBody.trim()}
                  onClick={() => shareNoticeToWhatsApp(apartment?.name, nTitle, nBody)}
                  className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-lg shadow-sm inline-flex items-center justify-center gap-1.5"
                >
                  <Share2 className="w-4 h-4 shrink-0" />
                  <span>Post to WhatsApp</span>
                </button>
              </div>
            </form>

            {notices.length > 0 && (
              <div className="pt-3 border-t space-y-2 max-h-48 overflow-y-auto">
                <p className="text-[11px] font-bold uppercase text-slate-500">Published Notices</p>
                {notices.map((n) => (
                  <div key={n.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-start justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">{n.title}</p>
                      <p className="text-slate-600 line-clamp-2">{n.body}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => shareNoticeToWhatsApp(apartment?.name, n.title, n.body)}
                      className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg"
                    >
                      <Share2 className="w-3 h-3" />
                      <span>WhatsApp</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-amber-500">
            <h3 className="font-bold text-slate-800 mb-3">Society Helpdesk Tickets</h3>
            <div className="space-y-2">
              {tickets.length === 0 && <p className="text-xs text-slate-500">No open helpdesk tickets.</p>}
              {tickets.map((t) => (
                <div key={t.id} className="p-2.5 bg-slate-50 rounded-xl flex justify-between items-center text-xs border border-slate-100 gap-2">
                  <div>
                    <p className="font-bold text-slate-900">Flat {t.flat_number} • {t.category}</p>
                    <p className="text-slate-600">{t.description}</p>
                  </div>
                  {t.status !== 'Resolved' ? (
                    <button onClick={() => resolveTicket(t.id)} className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg font-medium shrink-0">Mark Resolved</button>
                  ) : (
                    <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">Resolved</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Manage Community Polls Card */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-emerald-600 space-y-4">
        <div>
          <h3 className="font-bold text-slate-800">Manage Community Polls</h3>
          <p className="text-xs text-slate-500 mt-0.5">Create a poll for residents to vote on (one vote per flat) and view live results.</p>
        </div>

        <form onSubmit={createCommunityPoll} className="grid md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Poll Question</label>
            <input
              type="text"
              required
              placeholder="e.g. Should we install EV charging points in Basement 1?"
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Options (Comma-Separated)</label>
            <input
              type="text"
              required
              value={pollOptionsInput}
              onChange={(e) => setPollOptionsInput(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
            />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button
              disabled={creatingPoll}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm"
            >
              {creatingPoll ? 'Publishing...' : 'Publish New Active Poll'}
            </button>
          </div>
        </form>

        {polls.length > 0 && (
          <div className="pt-3 border-t space-y-2.5">
            <p className="text-[11px] font-bold uppercase text-slate-500">Poll Results & History</p>
            {polls.map((p) => {
              const thisPollVotes = pollVotes.filter((v) => v.poll_id === p.id);
              return (
                <div key={p.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-slate-900">{p.question}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`px-2 py-0.5 rounded-full font-bold ${p.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                        {p.is_active ? 'Active' : 'Closed'}
                      </span>
                      {p.is_active && (
                        <button
                          type="button"
                          onClick={() => closeCommunityPoll(p.id)}
                          className="px-2 py-0.5 bg-red-600 text-white rounded font-semibold"
                        >
                          Close
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(p.options || []).map((opt) => {
                      const cnt = thisPollVotes.filter((v) => v.option_selected === opt).length;
                      return (
                        <span key={opt} className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-medium">
                          {opt}: <strong className="text-indigo-700">{cnt}</strong>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Society Members & Contact Directory (With Call + WhatsApp Confirmation) */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-indigo-500">
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Phone className="w-4 h-4 text-indigo-600" /> Verified Society Directory ({verifiedUsers.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 border-b">
              <tr>
                <th className="p-2.5">Flat</th>
                <th className="p-2.5">Name</th>
                <th className="p-2.5">Role / Type</th>
                <th className="p-2.5">Mobile</th>
                <th className="p-2.5">Quick Contact</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {verifiedUsers.map((u) => (
                <tr key={u.id}>
                  <td className="p-2.5 font-bold text-indigo-700">{u.flat_number || 'Staff'}</td>
                  <td className="p-2.5 font-semibold text-slate-900">{u.full_name}</td>
                  <td className="p-2.5 capitalize">
                    {u.role === 'resident' ? formatResidentTypeLabel(u.resident_type) : u.role}
                  </td>
                  <td className="p-2.5 font-mono">{u.phone_number || 'Not added'}</td>
                  <td className="p-2.5">
                    {u.phone_number ? (
                      <div className="flex items-center gap-1.5">
                        <a
                          href={`tel:${u.phone_number}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 text-white rounded-lg font-semibold"
                        >
                          <Phone className="w-3 h-3" />
                          <span>Call</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => sendApprovalWhatsApp(apartment?.name, u, u.is_flat_primary)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold"
                        >
                          <MessageCircle className="w-3 h-3" />
                          <span>WhatsApp</span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 border-t-4 border-t-violet-600">
        <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2">
          <Settings className="w-4 h-4 text-violet-600" /> Configure Society UPI, Amenity & Helpdesk Options
        </h3>
        <p className="text-xs text-slate-500 mb-4">Set your society's official UPI ID for zero-fee maintenance payments and customize dropdown options.</p>
        <form onSubmit={savePortalOptions} className="grid md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Society RWA UPI ID (e.g. loyalmatesrwa@sbi)</label>
            <input
              type="text"
              placeholder="Enter society UPI ID (e.g. apartmentname@okicici)"
              value={editUpiId}
              onChange={(e) => setEditUpiId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Community Amenities</label>
            <textarea rows={3} required value={editAmenities} onChange={(e) => setEditAmenities(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Booking Time Slots (Includes Full Day)</label>
            <textarea rows={3} required value={editSlots} onChange={(e) => setEditSlots(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Helpdesk Complaint Categories</label>
            <textarea rows={2} required value={editCategories} onChange={(e) => setEditCategories(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs" />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button disabled={savingOptions} className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl shadow-sm">
              {savingOptions ? 'Saving Settings...' : 'Save UPI & Portal Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
