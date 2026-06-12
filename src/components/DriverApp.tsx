import React, { useState, useEffect } from 'react';
import {
  db,
  handleFirestoreError,
  OperationType
} from '../firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  query,
  where,
  onSnapshot,
  updateDoc,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import {
  Truck,
  AlertOctagon,
  CheckCircle,
  FileText,
  Camera,
  MapPin,
  Clock,
  Play,
  RotateCcw,
  Wrench,
  AlertTriangle,
  FileCheck,
  Phone,
  LogOut,
  Map,
  Check,
  Navigation,
  Sparkles,
  RefreshCw,
  Plus
} from 'lucide-react';
import { AppUser, DriverMaster, LoadingConfirmation, TripAssignment, VehicleInspection, TripMovement, MaintenanceTicket, PodUpload, VehicleMaster } from '../types';
import { compressImage, formatTime } from '../utils/imageCompressor';
import { getTruckFlagStyle, truckFlagBadgeClassName } from '../utils/truckFlagStyle';
import SignatureCanvas from './SignatureCanvas';
import AudioRecorder from './AudioRecorder';

interface DriverAppProps {
  currentUser: AppUser | null;
  onLogout: () => void;
  onLoginSuccess: (user: AppUser) => void;
  fullScreen?: boolean;
}

const normalizeVehicleNumber = (value: string = '') => value.trim().toUpperCase();
const normalizeMobileNumber = (value: string = '') => value.trim();
const normalizeDriverName = (value: string = '') => value.trim().toLowerCase();

const getGoogleMapUrl = (location: string): string => {
  const trimmedLocation = location.trim();
  if (!trimmedLocation) return '';
  if (trimmedLocation.toLowerCase().startsWith('http')) return trimmedLocation;

  const coordinatesPattern = /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/;
  if (coordinatesPattern.test(trimmedLocation)) {
    return `https://www.google.com/maps?q=${trimmedLocation.replace(/\s+/g, '')}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmedLocation)}`;
};

const driverLightThemeStyles = `
  .dnk-driver-light {
    background: #F8FAFC !important;
    color: #111827 !important;
  }

  .dnk-driver-light [class*="bg-slate-950"],
  .dnk-driver-light [class*="bg-slate-900"],
  .dnk-driver-light [class*="bg-slate-800"],
  .dnk-driver-light [class*="bg-indigo-950"],
  .dnk-driver-light [class*="bg-emerald-950"] {
    background: #FFFFFF !important;
  }

  .dnk-driver-light [class*="bg-gradient-to"] {
    background-image: none !important;
    background-color: #FFFFFF !important;
  }

  .dnk-driver-light [class*="bg-white/"],
  .dnk-driver-light [class*="bg-indigo-500/"],
  .dnk-driver-light [class*="bg-emerald-500/"],
  .dnk-driver-light [class*="bg-amber-500/"],
  .dnk-driver-light [class*="bg-rose-500/"] {
    background-color: #EEF2FF !important;
  }

  .dnk-driver-light [class*="border-white/"],
  .dnk-driver-light [class*="border-slate-"],
  .dnk-driver-light [class*="border-indigo-500/"],
  .dnk-driver-light [class*="border-emerald-500/"],
  .dnk-driver-light [class*="border-amber-500/"],
  .dnk-driver-light [class*="border-rose-500/"] {
    border-color: #CBD5E1 !important;
  }

  .dnk-driver-light [class*="text-white"],
  .dnk-driver-light [class*="text-slate-100"],
  .dnk-driver-light [class*="text-slate-200"],
  .dnk-driver-light [class*="text-slate-300"] {
    color: #111827 !important;
  }

  .dnk-driver-light label,
  .dnk-driver-light [class*="text-slate-400"],
  .dnk-driver-light [class*="text-slate-500"] {
    color: #334155 !important;
  }

  .dnk-driver-light label,
  .dnk-driver-light [class*="text-[9px]"],
  .dnk-driver-light [class*="text-[10px]"] {
    font-size: 12px !important;
  }

  .dnk-driver-light input,
  .dnk-driver-light textarea,
  .dnk-driver-light select {
    background: #FFFFFF !important;
    color: #111827 !important;
    border-color: #CBD5E1 !important;
    font-size: 14px !important;
  }

  .dnk-driver-light input::placeholder,
  .dnk-driver-light textarea::placeholder {
    color: #94A3B8 !important;
  }

  .dnk-driver-light button {
    font-size: 14px;
  }

  .dnk-driver-light [class*="bg-indigo-600"],
  .dnk-driver-light [class*="bg-indigo-700"],
  .dnk-driver-light [class*="hover:bg-indigo-700"] {
    background-color: #4F46E5 !important;
    color: #FFFFFF !important;
  }

  .dnk-driver-light [class*="bg-slate-700"] {
    background-color: #E2E8F0 !important;
    color: #111827 !important;
  }

  .dnk-driver-light .driver-brand-title,
  .dnk-driver-light .driver-brand-subtitle {
    font-size: 0 !important;
  }

  .dnk-driver-light .driver-brand-title::before {
    content: "DNK TRANS LOGISTICS";
    display: block;
    color: #111827;
    font-size: 20px;
    line-height: 1.1;
    font-weight: 900;
  }

  .dnk-driver-light .driver-brand-subtitle::before {
    content: "DRIVER PORTAL";
    display: block;
    color: #334155;
    font-size: 13px;
    letter-spacing: 0.08em;
    font-weight: 800;
  }

  .dnk-driver-light .driver-mobile-label,
  .dnk-driver-light .driver-name-label,
  .dnk-driver-light .driver-otp-label,
  .dnk-driver-light .driver-get-otp,
  .dnk-driver-light .driver-verify-otp,
  .dnk-driver-light .driver-login-button {
    font-size: 0 !important;
  }

  .dnk-driver-light .driver-mobile-label::before {
    content: "मोबाइल नंबर / Mobile No.";
  }

  .dnk-driver-light .driver-name-label::before {
    content: "ड्राइवर नाम / Driver Name";
  }

  .dnk-driver-light .driver-otp-label::before {
    content: "OTP दर्ज करें / Enter OTP";
  }

  .dnk-driver-light .driver-get-otp::before {
    content: "OTP प्राप्त करें / Get OTP";
  }

  .dnk-driver-light .driver-verify-otp::before {
    content: "OTP सत्यापित करें / Verify OTP";
  }

  .dnk-driver-light .driver-login-button::before {
    content: "लॉगिन करें / Login";
  }

  .dnk-driver-light .driver-mobile-label::before,
  .dnk-driver-light .driver-name-label::before,
  .dnk-driver-light .driver-otp-label::before {
    color: #334155;
    font-size: 13px;
    font-weight: 800;
  }

  .dnk-driver-light .driver-get-otp::before,
  .dnk-driver-light .driver-verify-otp::before,
  .dnk-driver-light .driver-login-button::before {
    color: #FFFFFF;
    font-size: 14px;
    font-weight: 800;
  }
`;

export default function DriverApp({ currentUser, onLogout, onLoginSuccess, fullScreen = false }: DriverAppProps) {
  // Authentication states
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Active sync lists
  const [activeTrip, setActiveTrip] = useState<TripAssignment | null>(null);
  const [activeLoadingConfirmation, setActiveLoadingConfirmation] = useState<LoadingConfirmation | null>(null);
  const [activeVehicle, setActiveVehicle] = useState<any | null>(null);
  const [currentDriverMaster, setCurrentDriverMaster] = useState<DriverMaster | null>(null);
  const [assignedTruckNumber, setAssignedTruckNumber] = useState('');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingConfirmationsList, setLoadingConfirmationsList] = useState<any[]>([]);

  // Sub-modules state
  const [showInspection, setShowInspection] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [showDelay, setShowDelay] = useState(false);

  // Handover checklist states
  const [odometer, setOdometer] = useState<number>(0);
  const [inspectionPhotos, setInspectionPhotos] = useState<{
    front?: string;
    back?: string;
    left?: string;
    right?: string;
    odometer?: string;
  }>({});
  const [inspectionSignature, setInspectionSignature] = useState('');
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [inspectionChecklist, setInspectionChecklist] = useState({
    engineOil: false,
    coolantWater: false,
    brakeOil: false,
    clutchOil: false,
    powerSteeringOil: false,
    batteryCondition: false,
    headLights: false,
    indicators: false,
    horn: false,
    tyresCondition: false,
    stepneyAvailable: false,
    toolKitAvailable: false,
    jackAvailable: false,
    fireExtinguisher: false,
    firstAidBox: false,
  });

  // Delay form
  const [delayReason, setDelayReason] = useState<'traffic' | 'breakdown' | 'accident' | 'rto' | 'other'>('traffic');
  const [delayDetails, setDelayDetails] = useState('');
  const [delayPhoto, setDelayPhoto] = useState('');
  const [delayVoice, setDelayVoice] = useState('');

  // Maintenance form
  const [maintIssue, setMaintIssue] = useState<'tyre' | 'battery' | 'engine' | 'oil' | 'light' | 'other'>('tyre');
  const [maintDetails, setMaintDetails] = useState('');
  const [maintPhoto, setMaintPhoto] = useState('');
  const [maintVoice, setMaintVoice] = useState('');

  // Loading / Unloading / POD forms
  const [loadingPhoto, setLoadingPhoto] = useState('');
  const [unloadingPhoto, setUnloadingPhoto] = useState('');
  const [podPhoto, setPodPhoto] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [receiverMobile, setReceiverMobile] = useState('');
  const [receiverSignature, setReceiverSignature] = useState('');

  // Status transitions loaders
  const [submittingStep, setSubmittingStep] = useState(false);
  const [startKm, setStartKm] = useState<number | ''>('');

  // Helper to dynamically update vehicle status flag and push to vehicleStatusAudit
  const updateVehicleFlag = async (statusFlag: string, remarks: string) => {
    if (!activeTrip || !activeTrip.vehicleNumber) return;
    try {
      const vQuery = query(collection(db, 'vehicles'), where('vehicleNumber', '==', activeTrip.vehicleNumber.trim().toUpperCase()));
      const vSnapshot = await getDocs(vQuery);
      if (!vSnapshot.empty) {
        const vDoc = vSnapshot.docs[0];
        console.log('Vehicle Before Status', { vehicleNumber: activeTrip.vehicleNumber.trim().toUpperCase(), beforeStatus: vDoc.data()?.statusFlag });

        await updateDoc(doc(db, 'vehicles', vDoc.id), { statusFlag, updatedAt: serverTimestamp() });

        try {
          const updated = await getDoc(doc(db, 'vehicles', vDoc.id));
          console.log('Vehicle After Status', { vehicleNumber: activeTrip.vehicleNumber.trim().toUpperCase(), afterStatus: updated.data()?.statusFlag });
        } catch (readErr) {
          console.warn('Vehicle After Status read failed', readErr);
        }

        console.log('Firestore Update Success', { vehicleId: vDoc.id, vehicleNumber: activeTrip.vehicleNumber.trim().toUpperCase(), newStatus: statusFlag });
      }

      // Record detailed audit
      const auditId = `audit_${Date.now()}_${activeTrip.id}`;
      await setDoc(doc(db, 'vehicleStatusAudit', auditId), {
        id: auditId,
        vehicleNo: activeTrip.vehicleNumber,
        statusFlag,
        tripId: activeTrip.id,
        updatedBy: currentUser?.name || 'Driver App User',
        timestamp: new Date().toISOString(),
        remarks
      });
    } catch (e) {
      console.error("Error updating vehicle status flag: ", e);
    }
  };

  // GPS Simulation
  const [gpsSim, setGpsSim] = useState<{ latitude: number; longitude: number }>({
    latitude: 28.6139,
    longitude: 77.2090 // Default Delhi
  });

  // Auto-fetch GPS on load
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsSim({
            latitude: Number(pos.coords.latitude.toFixed(4)),
            longitude: Number(pos.coords.longitude.toFixed(4))
          });
        },
        () => {
          // Standard mock coords fallback
        }
      );
    }
  }, []);

  // Fetch driver assignments, loading confirmations & notifications in real-time once logged in
  useEffect(() => {
    if (!currentUser) return;

    setLoading(true);

    let driversList: DriverMaster[] = [];
    let vehiclesList: VehicleMaster[] = [];
    let tripsList: TripAssignment[] = [];
    let loadingList: LoadingConfirmation[] = [];
    const ready = { drivers: false, vehicles: false, trips: false, loadingConfirmations: false };

    const resolveDriverWork = () => {
      if (!ready.drivers || !ready.vehicles || !ready.trips || !ready.loadingConfirmations) return;

      const currentMobile = normalizeMobileNumber(currentUser.mobile);
      const currentName = normalizeDriverName(currentUser.name);
      const driverMaster = driversList.find(driver =>
        driver.id === currentUser.uid ||
        normalizeMobileNumber(driver.mobile) === currentMobile ||
        normalizeDriverName(driver.name) === currentName
      );
      setCurrentDriverMaster(driverMaster || null);

      const driverIds = new Set([currentUser.uid, driverMaster?.id].filter(Boolean) as string[]);
      const driverNames = new Set([currentName, normalizeDriverName(driverMaster?.name || '')].filter(Boolean));
      const driverMobiles = new Set([currentMobile, normalizeMobileNumber(driverMaster?.mobile || '')].filter(Boolean));
      const linkedVehicleNumbers = new Set<string>();

      const driverLinkedVehicle = normalizeVehicleNumber(driverMaster?.linkedVehicleNumber || (currentUser as any).linkedVehicleNumber || '');
      if (driverLinkedVehicle) linkedVehicleNumbers.add(driverLinkedVehicle);

      let resolvedAssignedTruck = driverLinkedVehicle;

      vehiclesList.forEach(vehicle => {
        const vehicleNumber = normalizeVehicleNumber(vehicle.vehicleNumber);
        const linkedDriverId = vehicle.linkedDriverId || '';
        const linkedDriverName = normalizeDriverName(vehicle.linkedDriverName || '');

        if (
          driverIds.has(linkedDriverId) ||
          (linkedDriverName && driverNames.has(linkedDriverName)) ||
          (vehicleNumber && linkedVehicleNumbers.has(vehicleNumber))
        ) {
          linkedVehicleNumbers.add(vehicleNumber);
        }

        if (
          !resolvedAssignedTruck &&
          driverMaster &&
          vehicleNumber &&
          (
            linkedDriverId === driverMaster.id ||
            (linkedDriverName && linkedDriverName === normalizeDriverName(driverMaster.name))
          )
        ) {
          resolvedAssignedTruck = vehicleNumber;
        }
      });
      setAssignedTruckNumber(resolvedAssignedTruck);

      const matchingTrips = tripsList
        .filter(trip => trip.status !== 'completed')
        .filter(trip => {
          const tripVehicle = normalizeVehicleNumber(trip.vehicleNumber);
          const tripDriverName = normalizeDriverName(trip.driverName);
          return (
            driverIds.has(trip.driverId) ||
            (tripDriverName && driverNames.has(tripDriverName)) ||
            (tripVehicle && linkedVehicleNumbers.has(tripVehicle))
          );
        })
        .sort((a, b) => new Date(b.updatedAt || b.assignedDate || 0).getTime() - new Date(a.updatedAt || a.assignedDate || 0).getTime());

      const matchingLoadingConfirmations = loadingList
        .filter(lc => lc.status === 'confirmed' || lc.status === 'pending')
        .filter(lc => {
          const loadingVehicle = normalizeVehicleNumber(lc.vehicleNo || '');
          const loadingDriverName = normalizeDriverName(lc.driverName || '');
          const loadingMobile = normalizeMobileNumber(lc.driverMobile || '');
          return (
            (loadingMobile && driverMobiles.has(loadingMobile)) ||
            (loadingDriverName && driverNames.has(loadingDriverName)) ||
            (loadingVehicle && linkedVehicleNumbers.has(loadingVehicle))
          );
        })
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || b.loadingDate || 0).getTime() - new Date(a.updatedAt || a.createdAt || a.loadingDate || 0).getTime());

      setActiveTrip(matchingTrips[0] || null);
      setActiveLoadingConfirmation(matchingLoadingConfirmations[0] || null);
      setLoadingConfirmationsList(matchingLoadingConfirmations);
      setLoading(false);
    };

    const unsubscribeDrivers = onSnapshot(collection(db, 'drivers'), (snapshot) => {
      driversList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DriverMaster));
      ready.drivers = true;
      resolveDriverWork();
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'drivers');
      ready.drivers = true;
      resolveDriverWork();
    });

    const unsubscribeVehicles = onSnapshot(collection(db, 'vehicles'), (snapshot) => {
      vehiclesList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as VehicleMaster));
      ready.vehicles = true;
      resolveDriverWork();
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'vehicles');
      ready.vehicles = true;
      resolveDriverWork();
    });

    const unsubscribeTrips = onSnapshot(collection(db, 'tripAssignments'), (snapshot) => {
      tripsList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TripAssignment));
      ready.trips = true;
      resolveDriverWork();
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'tripAssignments');
      ready.trips = true;
      resolveDriverWork();
    });

    const unsubscribeLoadingDirs = onSnapshot(collection(db, 'loadingConfirmations'), (snapshot) => {
      loadingList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LoadingConfirmation));
      ready.loadingConfirmations = true;
      resolveDriverWork();
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'loadingConfirmations');
      ready.loadingConfirmations = true;
      resolveDriverWork();
    });

    // Listen for critical broadcast system alerts or notifications
    const notifyQuery = query(
      collection(db, 'notifications'),
      where('isRead', '==', false)
    );
    const unsubscribeNotify = onSnapshot(notifyQuery, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      setNotifications(list.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    });

    return () => {
      unsubscribeDrivers();
      unsubscribeVehicles();
      unsubscribeTrips();
      unsubscribeNotify();
      unsubscribeLoadingDirs();
    };
  }, [currentUser]);

  // Listen for active vehicle status details
  useEffect(() => {
    const vehicleNumber = activeTrip?.vehicleNumber || activeLoadingConfirmation?.vehicleNo || '';
    if (!vehicleNumber) {
      setActiveVehicle(null);
      return;
    }
    const vQuery = query(
      collection(db, 'vehicles'),
      where('vehicleNumber', '==', normalizeVehicleNumber(vehicleNumber))
    );
    const unsubscribeVehicle = onSnapshot(vQuery, (snapshot) => {
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        setActiveVehicle({ id: docSnap.id, ...docSnap.data() });
      } else {
        setActiveVehicle(null);
      }
    }, (error) => {
      console.error("Error listening to vehicle updates: ", error);
    });
    return () => unsubscribeVehicle();
  }, [activeTrip, activeLoadingConfirmation]);

  // Admin-controlled Driver Master OTP login flow
  const handleDriverOtpLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const formattedPhone = phone.trim();
    if (!formattedPhone || formattedPhone.length < 10) {
      alert("Please enter a valid 10-digit mobile number");
      return;
    }
    if (!otp) {
      alert("Please enter OTP");
      return;
    }

    setAuthLoading(true);
    try {
      const driverQuery = query(collection(db, 'drivers'), where('mobile', '==', formattedPhone));
      const driverSnap = await getDocs(driverQuery);
      if (driverSnap.empty) {
        alert("Driver mobile not found. Please contact Operations Admin.");
        return;
      }

      const driverDoc = driverSnap.docs[0];
      const driver = { id: driverDoc.id, ...driverDoc.data() } as DriverMaster;
      if (driver.otpActive !== true) {
        alert("Driver OTP is inactive. Please contact Operations Admin.");
        return;
      }
      if ((driver.loginOtp || '').trim() !== otp.trim()) {
        alert("Invalid OTP. Please check with Operations Admin.");
        return;
      }

      onLoginSuccess({
        uid: driver.id,
        name: driver.name,
        mobile: driver.mobile,
        role: 'driver',
        status: driver.driverStatus === 'inactive' ? 'inactive' : 'active',
        createdAt: driver.createdAt || new Date().toISOString()
      });
    } catch (err) {
      console.error("Driver OTP login failed", err);
      alert("Verification error, please try again");
    } finally {
      setAuthLoading(false);
    }
  };

  // Trigger immediate SOS Notification alerting the operations desk
  const handleSOS = async () => {
    if (!currentUser) return;
    const confirmSOS = window.confirm("🚨 क्या आप आपातकालीन SOS अलर्ट भेजना चाहते हैं? (Are you sure you want to trigger SOS alert?)");
    if (!confirmSOS) return;

    try {
      const sosRef = collection(db, 'notifications');
      const payload = {
        type: 'sos',
        title: `🚨 SOS: Emergency Driver Alert!`,
        message: `Driver ${currentUser.name} (${currentUser.mobile}) clicked Emergency SOS for active vehicle ${activeTrip?.vehicleNumber || 'Unassigned'}`,
        timestamp: new Date().toISOString(),
        vehicleNumber: activeTrip?.vehicleNumber || 'Unassigned',
        driverName: currentUser.name,
        location: gpsSim,
        isRead: false
      };
      await addDoc(sosRef, payload);
      alert("🚨 आपातकालीन संकेत Operations को भेजा गया! (Emergency SOS sent to operations desk!)");
    } catch (err) {
      console.error("SOS submission fail", err);
    }
  };

  // Convert File input to compressed base64
  const capturePhoto = async (e: React.ChangeEvent<HTMLInputElement>, targetKey: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await compressImage(file);
      if (targetKey.startsWith('inspect_')) {
        const key = targetKey.replace('inspect_', '');
        setInspectionPhotos(prev => ({ ...prev, [key]: base64 }));
      } else if (targetKey === 'delay') {
        setDelayPhoto(base64);
      } else if (targetKey === 'maint') {
        setMaintPhoto(base64);
      } else if (targetKey === 'loading') {
        setLoadingPhoto(base64);
      } else if (targetKey === 'unloading') {
        setUnloadingPhoto(base64);
      } else if (targetKey === 'pod') {
        setPodPhoto(base64);
      }
    } catch (err) {
      console.error("Error capturing photo", err);
      alert("फोटो कम्प्रेस करने में विफलता (Photo capture failed)");
    }
  };

  // Save Handover Inspection
  const submitInspection = async () => {
    if (!activeTrip || !currentUser) return;
    if (!odometer || odometer <= 0) {
      alert("कृपया ओडोमीटर रीडिंग दर्ज करें (Please enter an odometer reading)");
      return;
    }
    if (!declarationAccepted) {
      alert("कृपया नियम और घोषणा स्वीकार करें (Please accept the driver declaration)");
      return;
    }
    if (!inspectionSignature) {
      alert("कृपया डिजिटल हस्ताक्षर करें (Please sign before submitting)");
      return;
    }

    setSubmittingStep(true);
    try {
      const inspectId = `inspect_${activeTrip.id}`;
      const payload: VehicleInspection = {
        id: inspectId,
        tripId: activeTrip.id,
        vehicleNumber: activeTrip.vehicleNumber,
        driverId: currentUser.uid,
        driverName: currentUser.name,
        odometerReading: Number(odometer),
        checklist: inspectionChecklist,
        frontPhotoUrl: inspectionPhotos.front || '',
        backPhotoUrl: inspectionPhotos.back || '',
        leftPhotoUrl: inspectionPhotos.left || '',
        rightPhotoUrl: inspectionPhotos.right || '',
        odometerPhotoUrl: inspectionPhotos.odometer || '',
        digitalSignatureUrl: inspectionSignature,
        driverDeclarationAccepted: declarationAccepted,
        inspectedAt: new Date().toISOString()
      };

      // 1. Create inspection doc
      await setDoc(doc(db, 'vehicleInspections', inspectId), payload);

      // 2. Update tripAssignment life phase
      await updateDoc(doc(db, 'tripAssignments', activeTrip.id), {
        status: 'inspected' as const,
        updatedAt: new Date().toISOString()
      });

      setShowInspection(false);
      alert("🚗 वाहन हैंडओवर निरीक्षण स्वीकृत! (Vehicle handover inspection successfully accepted!)");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'vehicleInspections');
    } finally {
      setSubmittingStep(false);
    }
  };

  // LOADING PROCESS REPORTING
  const reportLoadingEvent = async (nextStatus: 'loading_started' | 'loaded') => {
    if (!activeTrip || !currentUser) return;
    if (nextStatus === 'loaded' && !loadingPhoto) {
      alert("लोडिंग समाप्त फोटो अपलोड करना अनिवार्य है (Loading photo is required to complete loaded checklist)");
      return;
    }

    setSubmittingStep(true);
    try {
      const moveId = `move_${nextStatus}_${activeTrip.id}_${Date.now()}`;
      const mPayload: TripMovement = {
        id: moveId,
        tripId: activeTrip.id,
        eventType: nextStatus === 'loading_started' ? 'loading_start' : 'loading_complete',
        timestamp: new Date().toISOString(),
        photoUrl: loadingPhoto || undefined,
        location: {
          latitude: gpsSim.latitude,
          longitude: gpsSim.longitude,
          address: "Loading Point Anchor Coordinates"
        },
        recordedBy: currentUser.name
      };

      await setDoc(doc(db, 'tripMovements', moveId), mPayload);

      await updateDoc(doc(db, 'tripAssignments', activeTrip.id), {
        status: nextStatus,
        updatedAt: new Date().toISOString()
      });

      if (nextStatus === 'loaded') {
        await updateVehicleFlag('LOADING DONE', 'Driver uploaded Loading Photo or pressed Loading Done');
      }

      alert(nextStatus === 'loading_started' ? "📥 लोडिंग शुरू दर्ज हुई! (Loading started is updated!)" : "✅ लोडिंग सफलतापूर्वक समाप्त! (Loading completed verified!)");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tripMovements');
    } finally {
      setSubmittingStep(false);
    }
  };

  // TRIP RUNNING JOURNEY
  const reportJourneyStart = async () => {
    if (!activeTrip || !currentUser) return;
    if (!startKm || Number(startKm) <= 0) {
      alert("यात्रा शुरू करने के लिए स्टार्ट किलोमीटर रीडिंग (Start KM Reading) दर्ज करना अनिवार्य है (Start KM Reading is required to begin movement)");
      return;
    }

    setSubmittingStep(true);
    try {
      const moveId = `move_km_submit_${activeTrip.id}_${Date.now()}`;
      const payload: TripMovement = {
        id: moveId,
        tripId: activeTrip.id,
        eventType: 'journey_start',
        timestamp: new Date().toISOString(),
        location: {
          latitude: gpsSim.latitude,
          longitude: gpsSim.longitude,
          address: "Start KM logged by Driver"
        },
        recordedBy: currentUser.name
      };
      await setDoc(doc(db, 'tripMovements', moveId), payload);

      await updateDoc(doc(db, 'tripAssignments', activeTrip.id), {
        status: 'movement_pending' as any,
        startKm: Number(startKm),
        updatedAt: new Date().toISOString()
      });

      // Update vehicle flag to MOVEMENT PENDING and write log
      await updateVehicleFlag('MOVEMENT PENDING', `Driver logged Start KM: ${startKm}. Awaiting Operations to generate Dispatch Movement.`);

      alert("📋 स्टार्ट किलोमीटर दर्ज हुआ! अब वाहन मूवमेंट पेंडिंग मोड में है। ऑपरेशन्स टीम से मूवमेंट जनरेट होने की प्रतीक्षा करें (Start KM recorded! Vehicle is now in MOVEMENT PENDING status. Awaiting Movement generation from Operations.)");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tripMovements');
    } finally {
      setSubmittingStep(false);
    }
  };

  // DELAY REPORTING
  const submitDelay = async () => {
    if (!activeTrip || !currentUser) return;
    if (!delayDetails) {
      alert("कृपया देरी का विवरण दें (Please enter delay details description)");
      return;
    }

    setSubmittingStep(true);
    try {
      const delayId = `delay_${Date.now()}`;
      const payload: TripMovement = {
        id: delayId,
        tripId: activeTrip.id,
        eventType: 'delay_reported',
        timestamp: new Date().toISOString(),
        photoUrl: delayPhoto || undefined,
        voiceUrl: delayVoice || undefined,
        delayReason: `${delayReason.toUpperCase()} - ${delayDetails}`,
        location: {
          latitude: gpsSim.latitude,
          longitude: gpsSim.longitude,
          address: `Active delay tag coordinates`
        },
        recordedBy: currentUser.name
      };
      await setDoc(doc(db, 'tripMovements', delayId), payload);

      // Create a warning notification for operations dashboard
      await addDoc(collection(db, 'notifications'), {
        type: 'delay',
        title: `⚠️ Trip Delay Alert!`,
        message: `Driver ${currentUser.name} reported delay [${delayReason.toUpperCase()}] for vehicle ${activeTrip.vehicleNumber}. Description: ${delayDetails}`,
        timestamp: new Date().toISOString(),
        vehicleNumber: activeTrip.vehicleNumber,
        driverName: currentUser.name,
        location: gpsSim,
        isRead: false
      });

      setShowDelay(false);
      setDelayDetails('');
      setDelayPhoto('');
      setDelayVoice('');
      alert("⚠️ देरी की सूचना Operations को भेजी गई (Delay notification successfully reported to Operations!)");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tripMovements');
    } finally {
      setSubmittingStep(false);
    }
  };

  // ISSUE / MAINTENANCE SUBMISSION
  const submitMaintenance = async () => {
    if (!currentUser) return;
    if (!maintDetails) {
      alert("समस्या का विवरण दर्ज करें (Please write down problem details)");
      return;
    }

    setSubmittingStep(true);
    try {
      const ticketId = `ticket_${Date.now()}`;
      const payload: MaintenanceTicket = {
        id: ticketId,
        vehicleNumber: activeTrip?.vehicleNumber || 'Unassigned',
        driverId: currentUser.uid,
        driverName: currentUser.name,
        issueType: maintIssue,
        problemDescription: maintDetails,
        photoUrl: maintPhoto || undefined,
        voiceUrl: maintVoice || undefined,
        status: 'open',
        location: gpsSim,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'maintenanceTickets', ticketId), payload);

      // Notify Ops
      await addDoc(collection(db, 'notifications'), {
        type: 'breakdown',
        title: `🔧 Maintenance Ticket Open!`,
        message: `Driver ${currentUser.name} opened ${maintIssue.toUpperCase()} issue ticket for Vehicle ${activeTrip?.vehicleNumber || 'None'}: ${maintDetails}`,
        timestamp: new Date().toISOString(),
        vehicleNumber: activeTrip?.vehicleNumber || 'Unknown',
        driverName: currentUser.name,
        location: gpsSim,
        isRead: false
      });

      setShowMaintenance(false);
      setMaintDetails('');
      setMaintPhoto('');
      setMaintVoice('');
      alert("🔧 मेंटेनेंस टिकट दर्ज़ हुआ! (Maintenance ticket successfully opened for workshop attention!)");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'maintenanceTickets');
    } finally {
      setSubmittingStep(false);
    }
  };

  // UNLOADING MILESTONES REPORTING
  const reportUnloadingEvent = async (nextStatus: 'unloading_started' | 'delivered') => {
    if (!activeTrip || !currentUser) return;
    if (nextStatus === 'delivered' && !unloadingPhoto) {
      alert("अनलोडिंग समाप्त फोटो अपलोड करें (Unloading complete photo is required to verify discharge)");
      return;
    }

    setSubmittingStep(true);
    try {
      const moveId = `move_${nextStatus}_${activeTrip.id}_${Date.now()}`;
      const payload: TripMovement = {
        id: moveId,
        tripId: activeTrip.id,
        eventType: nextStatus === 'unloading_started' ? 'unloading_start' : 'unloading_complete',
        timestamp: new Date().toISOString(),
        photoUrl: unloadingPhoto || undefined,
        location: {
          latitude: gpsSim.latitude,
          longitude: gpsSim.longitude,
          address: 'Unloading Point discharge location'
        },
        recordedBy: currentUser.name
      };
      await setDoc(doc(db, 'tripMovements', moveId), payload);

      await updateDoc(doc(db, 'tripAssignments', activeTrip.id), {
        status: nextStatus,
        updatedAt: new Date().toISOString()
      });

      if (nextStatus === 'unloading_started') {
        await updateVehicleFlag('UNLOADING REPORTING', 'Driver reached destination and reported starting unloading');
      } else if (nextStatus === 'delivered') {
        await updateVehicleFlag('UNLOADING DONE', 'Driver verified total discharge with receipt photo and set unloading done');
      }

      alert(nextStatus === 'unloading_started' ? "📥 अनलोडिंग शुरू! (Discharge starting in progress!)" : "✅ अनलोडिंग समाप्त! (Unloading completed!)");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tripMovements');
    } finally {
      setSubmittingStep(false);
    }
  };

  // UPLOAD POD (PROOF OF DELIVERY)
  const submitPod = async () => {
    if (!activeTrip || !currentUser) return;
    if (!podPhoto) {
      alert("पीओडी रसीद फोटो फ़ाइल अनिवार्य है (POD receipt photo upload is mandatory)");
      return;
    }
    if (!receiverName) {
      alert("प्राप्तकर्ता का नाम दर्ज करें (Receiver name is required)");
      return;
    }
    if (!receiverMobile || receiverMobile.length < 10) {
      alert("प्राप्तकर्ता का मोबाइल नंबर दर्ज करें (10-digit mobile number is required)");
      return;
    }
    if (!receiverSignature) {
      alert("प्राप्तकर्ता का डिजिटल हस्ताक्षर लें (Receiver digital signature is required)");
      return;
    }

    setSubmittingStep(true);
    try {
      const podId = activeTrip.id;
      const payload: PodUpload = {
        id: podId,
        tripId: activeTrip.id,
        podPhotoUrl: podPhoto,
        receiverName,
        receiverMobile,
        receiverSignatureUrl: receiverSignature,
        status: 'pending',
        uploadedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'podUploads', podId), payload);

      await updateDoc(doc(db, 'tripAssignments', activeTrip.id), {
        status: 'pod_uploaded',
        updatedAt: new Date().toISOString()
      });

      alert("📂 POD सफलतापूर्वक अपलोड! (POD successfully submitted! Awaiting operations desk review/approval.)");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'podUploads');
    } finally {
      setSubmittingStep(false);
    }
  };

  // Simulate GPS coordinates variation manually
  const simulateGpsWalk = () => {
    setGpsSim(prev => ({
      latitude: Number((prev.latitude + (Math.random() - 0.5) * 0.01).toFixed(4)),
      longitude: Number((prev.longitude + (Math.random() - 0.5) * 0.01).toFixed(4))
    }));
  };

  const openGoogleMapLocation = (googleMapLocation?: string) => {
    const mapUrl = getGoogleMapUrl(googleMapLocation || '');
    if (!mapUrl) return;
    window.open(mapUrl, '_blank', 'noopener,noreferrer');
  };

  const driverFrameClass = fullScreen
    ? 'w-screen h-screen bg-slate-50 relative select-none overflow-hidden'
    : 'w-full max-w-sm mx-auto bg-slate-150 rounded-[3rem] p-3 shadow-2xl border-4 border-slate-800 relative select-none';
  const driverShellClass = fullScreen
    ? 'dnk-driver-light bg-slate-950 text-white rounded-none overflow-hidden h-full min-h-0 flex flex-col justify-between relative font-sans text-xs'
    : 'dnk-driver-light bg-slate-950 text-white rounded-[2.5rem] overflow-hidden min-h-[640px] flex flex-col justify-between relative font-sans text-xs';
  const driverOverlayClass = fullScreen
    ? 'dnk-driver-light absolute inset-0 bg-slate-950 z-30 flex flex-col justify-between overflow-y-auto rounded-none p-4 text-left'
    : 'dnk-driver-light absolute inset-0 bg-slate-950 z-30 flex flex-col justify-between overflow-y-auto rounded-[2.5rem] p-4 text-left';

  // ==================== RENDER SIGN-IN SCREEN ====================
  if (!currentUser) {
    return (
      <div className={driverFrameClass}>
        {/* Smartphone Notch / Status Bar */}
        {!fullScreen && <div className="w-1/2 h-5 bg-slate-800 absolute top-0 left-1/4 rounded-b-xl z-20 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-slate-900 border border-slate-700"></div>
        </div>}

        <div className={driverShellClass}>
          <style>{driverLightThemeStyles}</style>
          
          {/* Header Segment */}
          <div className="bg-slate-900 px-6 py-9 text-center relative overflow-hidden border-b border-white/5">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl opacity-40"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl opacity-30"></div>
            
            <div className="mx-auto w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-white mb-3 backdrop-blur-md">
              <Truck className="w-6 h-6 text-indigo-400 animate-pulse" />
            </div>
            <h1 className="driver-brand-title text-[20px] font-extrabold tracking-tight text-white font-sans leading-tight">
              डीएनके ड्राइवर पोर्टल
            </h1>
            <p className="driver-brand-subtitle text-[13px] text-slate-400 font-bold tracking-widest uppercase font-mono mt-1">
              DNK DRIVER APP
            </p>
          </div>

          {/* Form Actions scroll wrapper */}
          <div className="p-6 flex-grow flex flex-col justify-center space-y-5 bg-slate-950">
            <form onSubmit={handleDriverOtpLogin} className="space-y-4 text-left">
              <div className="text-left space-y-1.5">
                <label className="driver-mobile-label block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  ?????? ???? / Mobile No.
                </label>
                <div className="relative">
                  <Phone className="absolute top-3.5 left-3 text-slate-400 w-4 h-4" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="9999900002"
                    className="w-full text-sm font-bold bg-white/5 hover:bg-white/10 border border-white/10 focus:border-indigo-500 rounded-xl py-3 pl-9 pr-3.5 text-white shadow-inner focus:outline-none focus:ring-1 focus:ring-indigo-500 tracking-wider font-mono"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="driver-otp-label block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  OTP ???? ???? / Enter OTP
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="1234"
                  className="w-full text-center text-xl font-bold bg-white/5 focus:bg-white/10 border border-white/10 rounded-xl py-3 text-white focus:outline-none tracking-widest focus:ring-1 focus:ring-indigo-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="driver-login-button w-full py-3.5 bg-indigo-600 hover:bg-indigo-505 active:scale-98 text-white font-bold rounded-xl shadow-lg transition-all text-xs tracking-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {authLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  "????? ???? / Login"
                )}
              </button>
            </form>
          </div>

          {/* Quick Footer Segment */}
          <div className="p-4 bg-slate-900 text-center border-t border-white/5">
            <span className="text-[8px] tracking-wider text-slate-500 font-mono uppercase">
              SECURED CLIENT ENVIRONMENT SANDBOX
            </span>
          </div>

        </div>
      </div>
    );
  }

  // ==================== CENTRAL PORTAL UI (DRIVER LOGGED IN) ====================
  return (
    <div className={driverFrameClass}>
      {/* Smartphone Notch / Status Bar */}
      {!fullScreen && <div className="w-1/2 h-5 bg-slate-800 absolute top-0 left-1/4 rounded-b-xl z-20 flex items-center justify-center">
        <div className="w-2.5 h-2.5 bg-camera rounded-full bg-slate-900 border border-slate-700"></div>
      </div>}

        <div className={driverShellClass}>
          <style>{driverLightThemeStyles}</style>
        {/* Navigation Head */}
        <div className="bg-slate-900 px-4 pt-6 pb-4 border-b border-white/5 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-slate-800/80 border border-emerald-500 flex items-center justify-center font-bold text-emerald-400 text-xs">
              {currentUser.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 truncate w-36 text-left">DNK TRANS LOGISTICS</h2>
              <p className="text-[10px] text-slate-400 font-mono truncate w-36">DRIVER PORTAL · {currentUser.name}</p>
              <p className="text-[10px] text-slate-400 font-mono">Driver ID: {currentDriverMaster?.driverCode || currentUser.uid.slice(-4)}</p>
              <p className="text-[10px] text-emerald-400 font-mono truncate w-36">
                गाड़ी / Vehicle: {assignedTruckNumber || 'Not linked yet'}
              </p>
            </div>
          </div>

          <div className="flex gap-1.5">
            <button
              onClick={handleSOS}
              className="px-2.5 py-1.5 rounded-lg bg-rose-600 active:scale-90 text-white text-[10px] font-extrabold flex items-center gap-1 shadow-md shadow-rose-900 hover:bg-rose-700 cursor-pointer"
            >
              <AlertOctagon className="w-3 h-3 text-white animate-bounce" />
              SOS
            </button>
            <button
              onClick={onLogout}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 active:scale-95 cursor-pointer"
              title="logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Smartphone Content Scrollable Area */}
        <div className="flex-grow overflow-y-auto px-3.5 py-3 space-y-4">
          {/* Driver Location simulation bar */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-2.5 rounded-xl border border-white/5 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-1 text-emerald-400">
              <MapPin className="w-3.5 h-3.5 animate-pulse" />
              <span className="font-semibold text-[10px] text-left">
                GPS: {gpsSim.latitude}, {gpsSim.longitude}
              </span>
            </div>
            <button
              onClick={simulateGpsWalk}
              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 active:scale-95 rounded-md text-[10px] text-slate-200 font-mono font-medium tracking-tight flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-2.5 h-2.5" /> GPS Walk
            </button>
          </div>

          <div className="bg-slate-900 p-3 rounded-xl border border-emerald-500/20 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Truck className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="min-w-0 text-left">
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">गाड़ी / Vehicle</span>
                <strong className="text-xs text-white font-mono block truncate">
                  गाड़ी / Vehicle: {assignedTruckNumber || 'Not linked yet'}
                </strong>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-2 text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin" />
              <span>डाटा सिंक हो रहा है... (Syncing driver records...)</span>
            </div>
          ) : !activeTrip && !activeLoadingConfirmation ? (
            /* NO ASSIGNED TRIP SCREEN */
            <div className="bg-slate-900 border border-white/5 rounded-2xl p-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-slate-800/80 mx-auto flex items-center justify-center text-slate-500">
                <Truck className="w-10 h-10" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">कोई यात्रा आवंटित नहीं है</h3>
                <p className="text-slate-400 text-xs">No active trip has been assigned matching this account.</p>
              </div>
              <p className="text-[10px] text-slate-500 bg-slate-950 p-3 rounded-lg border border-white/5 font-mono text-center">
                कृपया यात्रा विवरण के लिए अपने Operations Manager / Dispatch Controller से संपर्क करें।
              </p>
              <div className="pt-2">
                <button
                  onClick={() => setShowMaintenance(true)}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Wrench className="w-4 h-4" /> समस्या रिपोर्ट करें / Report Issue
                </button>
              </div>
            </div>
          ) : !activeTrip && activeLoadingConfirmation ? (
            /* LOADING CONFIRMATION FALLBACK SCREEN */
            <div className="space-y-4">
              <div className="bg-slate-900 rounded-2xl p-4 border border-indigo-500/30 space-y-3 shadow-lg relative overflow-hidden text-left">
                <div className="absolute top-0 right-0 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold py-1 px-3.5 rounded-bl-xl uppercase tracking-wider font-mono border-l border-b border-white/10">
                  LOADING CONFIRM
                </div>

                <div className="flex items-center gap-2 pr-24">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-emerald-500 flex items-center justify-center text-white font-bold">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-rose-400 font-mono tracking-wide">{activeLoadingConfirmation.vehicleNo || 'Vehicle Pending'}</h3>
                    <p className="text-[10px] text-slate-400">Loading assigned by Operations</p>
                  </div>
                </div>

                {activeVehicle?.statusFlag && (
                  <div className="p-3 bg-indigo-950/20 rounded-xl border border-indigo-500/10 flex items-center justify-between text-left">
                    <div>
                      <span className="text-[9px] text-indigo-300 font-bold uppercase tracking-wider block">Current Truck Flag</span>
                      <strong className="text-[11px] text-white font-medium block mt-0.5">{activeVehicle.statusFlag}</strong>
                    </div>
                    <span className={`${truckFlagBadgeClassName} shrink-0 font-mono tracking-wider`} style={getTruckFlagStyle(activeVehicle.statusFlag)}>
                      {activeVehicle.statusFlag}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-2 text-left">
                  <div className="bg-slate-950 p-2 rounded-lg border border-white/5">
                    <span className="text-[9px] text-slate-500 font-bold block uppercase tracking-wider">गाड़ी / Vehicle No.</span>
                    <strong className="text-xs text-white block truncate">{activeLoadingConfirmation.vehicleNo || '-'}</strong>
                  </div>
                  <div className="bg-slate-950 p-2 rounded-lg border border-white/5">
                    <span className="text-[9px] text-slate-500 font-bold block uppercase tracking-wider">ड्राइवर नाम / Driver Name</span>
                    <strong className="text-xs text-white block truncate">{activeLoadingConfirmation.driverName || currentUser.name}</strong>
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-white/5 space-y-2 text-slate-300">
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">लोडिंग / Loading Party</span>
                    <strong className="text-white text-xs block mt-0.5 leading-relaxed">{activeLoadingConfirmation.loadingParty || activeLoadingConfirmation.partyVendorInfo || '-'}</strong>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">लोडिंग / Loading Address</span>
                    <span className="text-slate-200 text-[11px] block mt-0.5 leading-relaxed">{activeLoadingConfirmation.loadingAddress || activeLoadingConfirmation.loadingPointLocation || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">रास्ता / Route Details</span>
                    <span className="text-slate-300 text-[11px] block mt-0.5 font-mono">{activeLoadingConfirmation.routeDetails || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">मैप / Loading Location</span>
                    {activeLoadingConfirmation.googleMapLocation?.trim() ? (
                      <button
                        type="button"
                        onClick={() => openGoogleMapLocation(activeLoadingConfirmation.googleMapLocation)}
                        className="mt-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-extrabold rounded-lg text-[10px] cursor-pointer"
                      >
                        मैप खोलें / Open Map
                      </button>
                    ) : (
                      <span className="text-slate-400 text-[11px] block mt-0.5">Location not provided</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 bg-slate-950 p-2 rounded-lg pr-4 font-mono">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{activeLoadingConfirmation.loadingDate || '-'} {activeLoadingConfirmation.loadingTime || ''}</span>
                  </div>
                  <span className="text-emerald-400 font-black uppercase">{activeLoadingConfirmation.status}</span>
                </div>
              </div>

              <button
                onClick={() => setShowMaintenance(true)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Wrench className="w-4 h-4" /> समस्या रिपोर्ट करें / Report Issue
              </button>
            </div>
          ) : (
            /* ACTIVE TRIP DASHBOARD SCREEN */
            <div className="space-y-4">
              {/* Trip Cards Details */}
              <div className="bg-slate-900 rounded-2xl p-4 border border-white/5 space-y-3 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold py-1 px-3.5 rounded-bl-xl uppercase tracking-wider font-mono border-l border-b border-white/10">
                  {activeTrip.status.toUpperCase().replace('_', ' ')}
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-rose-400 font-mono tracking-wide">{activeTrip.vehicleNumber}</h3>
                    <p className="text-[10px] text-slate-400">रास्ता / Route</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 text-left">
                  <div className="bg-slate-950 p-2 rounded-lg border border-white/5">
                    <span className="text-[9px] text-slate-500 font-bold block uppercase tracking-wider">लोडिंग / Loading</span>
                    <strong className="text-xs text-white block truncate">{activeTrip.loadingPoint}</strong>
                  </div>
                  <div className="bg-slate-950 p-2 rounded-lg border border-white/5">
                    <span className="text-[9px] text-slate-500 font-bold block uppercase tracking-wider">अनलोडिंग / Unloading</span>
                    <strong className="text-xs text-white block truncate">{activeTrip.unloadingPoint}</strong>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 bg-slate-950 p-2 rounded-lg pr-4 font-mono">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                    <span>ETA: {activeTrip.eta || 'Calculating...'}</span>
                  </div>
                  <span>{formatTime(activeTrip.updatedAt || activeTrip.assignedDate)}</span>
                </div>

                {activeVehicle?.statusFlag && (
                  <div className="p-3 bg-indigo-950/20 rounded-xl border border-indigo-500/10 flex items-center justify-between text-left">
                    <div>
                      <span className="text-[9px] text-indigo-300 font-bold uppercase tracking-wider block">वाहन का वर्तमान फ्लैग (Current Truck Flag)</span>
                      <strong className="text-[11px] text-white font-medium block mt-0.5">
                        {activeVehicle.statusFlag === 'LOADING FIND' ? 'लोड खोजें (Loading Point Find)' :
                         activeVehicle.statusFlag === 'LOADING CONFIRM' ? 'लोडिंग स्वीकृत (Loading Approved)' :
                         activeVehicle.statusFlag === 'LOADING DONE' ? 'लोड हो गया (Loading Done)' :
                         activeVehicle.statusFlag === 'MOVEMENT PENDING' ? 'अनुमति लंबित (Movement Approval Pending)' :
                         activeVehicle.statusFlag === 'RUNNING' ? 'मार्ग में है (Running / Transit)' :
                         activeVehicle.statusFlag === 'LATE' ? 'विलंब हो रहा है (Delayed / Late)' :
                         activeVehicle.statusFlag === 'UNLOADING REPORTING' ? 'अनलोडिंग रिपोर्ट दर्ज (Unloading Reporting)' :
                         activeVehicle.statusFlag === 'UNLOADING DONE' ? 'अनलोड हो गया (Unloading Completed)' :
                         activeVehicle.statusFlag}
                      </strong>
                    </div>
                    <span className={`${truckFlagBadgeClassName} shrink-0 font-mono tracking-wider`} style={getTruckFlagStyle(activeVehicle.statusFlag)}>
                      🚩 {activeVehicle.statusFlag}
                    </span>
                  </div>
                )}
              </div>

              {/* LOADING CONFIRMATION DIRECTIONS INFO FOR DRIVER */}
              {(() => {
                const assignedLoading = loadingConfirmationsList.find(lc =>
                  lc.tripId === activeTrip.id ||
                  normalizeVehicleNumber(lc.vehicleNo || '') === normalizeVehicleNumber(activeTrip.vehicleNumber) ||
                  normalizeDriverName(lc.driverName || '') === normalizeDriverName(activeTrip.driverName) ||
                  normalizeMobileNumber(lc.driverMobile || '') === normalizeMobileNumber(currentUser.mobile)
                );
                if (assignedLoading) {
                  return (
                    <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-4 shadow-sm space-y-3.5 text-left text-xs">
                      <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                        <h4 className="font-extrabold text-slate-200 block text-[11px] uppercase tracking-wide flex items-center gap-1.5">
                          <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />
                          <span>📌 लोडिंग / Loading Board</span>
                        </h4>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg uppercase font-mono border ${
                          assignedLoading.status === 'confirmed' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                          assignedLoading.status === 'cancelled' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' :
                          'bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse'
                        }`}>
                          {assignedLoading.status === 'confirmed' ? '✅ LOAD APPROVED' : '⏳ CONFIRM PENDING'}
                        </span>
                      </div>

                      <div className="space-y-2 text-slate-300">
                        <div>
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">1. लोडिंग स्थान (Point Location):</span>
                          <strong className="text-white text-xs block mt-0.5 leading-relaxed">{assignedLoading.loadingPointLocation}</strong>
                        </div>
                        <div>
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">2. पार्टी / वेंडर की जानकारी (Party/Vendor):</span>
                          <span className="text-slate-200 text-[11px] block mt-0.5 font-medium leading-relaxed">{assignedLoading.partyVendorInfo}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                          <div>
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">3. रास्ता / Route:</span>
                            <span className="text-slate-300 text-[11px] block mt-0.5 font-mono">{assignedLoading.routeDetails}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">4. वजन सीमा (Weight Details):</span>
                            <span className="text-slate-300 text-[11px] block mt-0.5 font-mono">{assignedLoading.weightDetails}</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-950 p-3 rounded-xl border border-white/5 space-y-2 text-slate-300">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">गाड़ी / Vehicle No.</span>
                            <strong className="text-white text-xs block mt-0.5 font-mono">{assignedLoading.vehicleNo || activeTrip.vehicleNumber || '-'}</strong>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">लोडिंग / Loading Date-Time</span>
                            <span className="text-slate-300 text-[11px] block mt-0.5 font-mono">{assignedLoading.loadingDate || '-'} {assignedLoading.loadingTime || ''}</span>
                          </div>
                        </div>
                        <div>
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">लोडिंग / Loading Party</span>
                          <strong className="text-white text-xs block mt-0.5 leading-relaxed">{assignedLoading.loadingParty || assignedLoading.partyVendorInfo || '-'}</strong>
                        </div>
                        <div>
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">लोडिंग / Loading Address</span>
                          <span className="text-slate-200 text-[11px] block mt-0.5 leading-relaxed">{assignedLoading.loadingAddress || assignedLoading.loadingPointLocation || '-'}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">रास्ता / Route Details</span>
                          <span className="text-slate-300 text-[11px] block mt-0.5 font-mono">{assignedLoading.routeDetails || '-'}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">मैप / Loading Location</span>
                          {assignedLoading.googleMapLocation?.trim() ? (
                            <button
                              type="button"
                              onClick={() => openGoogleMapLocation(assignedLoading.googleMapLocation)}
                              className="mt-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-extrabold rounded-lg text-[10px] cursor-pointer"
                            >
                              मैप खोलें / Open Map
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px] block mt-0.5">Location not provided</span>
                          )}
                        </div>
                      </div>

                      <div className="bg-slate-950 p-2.5 rounded-xl border border-white/5 flex items-center justify-between text-[10px] text-slate-400">
                        <div className="flex items-center gap-1.5 min-w-0 pr-2">
                          <Map className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span className="truncate font-mono">Simulated GPS: {gpsSim.latitude}°N, {gpsSim.longitude}°E</span>
                        </div>
                        <button
                          onClick={() => {
                            alert(`🧭 Navigation route engaged to loading point: ${assignedLoading.loadingPointLocation}`);
                          }}
                          className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-extrabold rounded-lg text-[9px] cursor-pointer whitespace-nowrap"
                        >
                          मैप खोलें / Open Map
                        </button>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* ACTIVE PROGRESS WORKFLOW PIPELINE ENGINES */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <span>यात्रा / Trip Tasks</span>
                </h4>

                {/* STEP 1: Handover Inspection */}
                {activeTrip.status === 'assigned' && (
                  <div className="bg-slate-900 border-2 border-dashed border-indigo-500/50 rounded-2xl p-4 text-center space-y-3 animate-pulse">
                    <div className="mx-auto w-10 h-10 bg-indigo-500/10 rounded-full flex items-center justify-center text-indigo-400">
                      <FileCheck className="w-6 h-6" />
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-slate-100">चरण 1: वाहन हैंडओवर निरीक्षण</h4>
                      <p className="text-[10px] text-slate-400">Complete vehicle compliance checklist before starting delivery.</p>
                    </div>
                    <button
                      onClick={() => setShowInspection(true)}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-extrabold rounded-xl text-xs tracking-wider cursor-pointer"
                    >
                      निरीक्षण शुरू करें (Start Handover Checklist)
                    </button>
                  </div>
                )}

                {/* STEP 2: Reached Loading Point & Start/Complete Loading */}
                {activeTrip.status === 'inspected' && (
                  <div className="bg-slate-900 border-2 border-dashed border-yellow-500/40 rounded-2xl p-4 space-y-3">
                    <div className="text-center space-y-0.5">
                      <h4 className="text-xs font-black text-amber-400">📥 लोडिंग / Loading Point</h4>
                      <p className="text-[10px] text-slate-400 select-all">Current location: Load area target route. Confirm start.</p>
                    </div>
                    <button
                      onClick={() => reportLoadingEvent('loading_started')}
                      disabled={submittingStep}
                      className="w-full py-3 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-black text-xs rounded-xl tracking-wide cursor-pointer"
                    >
                      {submittingStep ? "लिखा जा रहा है..." : "लोडिंग शुरू / Start Loading"}
                    </button>
                  </div>
                )}

                {activeTrip.status === 'loading_started' && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                    <h4 className="text-xs font-bold text-slate-100 text-center">📥 लोडिंग / Loading Photo</h4>
                    <p className="text-[10px] text-slate-400 text-center">Take loading area verification photo with current weight loads.</p>

                    <div className="bg-slate-950 p-4 border border-white/5 rounded-xl text-center space-y-2">
                      <div className="relative mx-auto w-24 h-24 bg-slate-900 border border-white/10 rounded-lg overflow-hidden flex items-center justify-center">
                        {loadingPhoto ? (
                          <img src={loadingPhoto} alt="Loading receipt" className="w-full h-full object-cover" />
                        ) : (
                          <Camera className="w-8 h-8 text-slate-600 animate-pulse" />
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => capturePhoto(e, 'loading')}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </div>
                      <span className="text-[9px] text-slate-400 block font-mono">लोडिंग का फ़ोटो लें (Capture loading photo)</span>
                    </div>

                    <button
                      onClick={() => reportLoadingEvent('loaded')}
                      disabled={submittingStep}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs rounded-xl tracking-wide cursor-pointer"
                    >
                      {submittingStep ? "अपलोड हो रहा है..." : "लोडिंग पूर्ण / Loading Done"}
                    </button>
                  </div>
                )}

                {/* STEP 3: START RUNNING JOURNEY */}
                {activeTrip.status === 'loaded' && (
                  <div className="bg-slate-900 border-2 border-indigo-600/60 rounded-2xl p-4 text-center space-y-3 font-sans">
                    <div className="mx-auto w-10 h-10 bg-indigo-600/10 rounded-full flex items-center justify-center text-indigo-400">
                      <Navigation className="w-6 h-6 animate-pulse" />
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-white">🚛 यात्रा / Start Trip</h4>
                      <p className="text-[10px] text-slate-400">Please enter current physical odometer Start KM reading to request dispatch authorization.</p>
                    </div>

                    <div className="space-y-2 bg-slate-950 p-3 rounded-xl border border-white/5">
                      <label className="text-white font-bold block text-left text-[11px] mb-1">
                        🔑 स्टार्ट ओडोमीटर रीडिंग * (Start KM Reading)
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 54310"
                        value={startKm || ''}
                        onChange={(e) => setStartKm(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full text-base bg-slate-900 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500 font-mono font-bold"
                      />
                    </div>

                    <button
                      onClick={reportJourneyStart}
                      disabled={submittingStep}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-extrabold text-xs rounded-xl cursor-pointer font-sans"
                    >
                      {submittingStep ? "ओडोमीटर दर्ज हो रहा है..." : "स्टार्ट रीडिंग और यात्रा शुरू करें (SUBMIT KM & REQUEST START)"}
                    </button>
                  </div>
                )}

                {/* MOVEMENT PENDING STATE WAIT BOARD */}
                {activeTrip.status === 'movement_pending' && (
                  <div className="bg-slate-900 border-2 border-amber-500/60 rounded-2xl p-4 text-center space-y-4 font-sans">
                    <div className="mx-auto w-11 h-11 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-400 font-bold">
                      <Clock className="w-6 h-6 animate-spin" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-[13px] font-black text-white uppercase tracking-wide">⏳ ऑपरेशन्स स्वीकृति की प्रतीक्षा</h4>
                      <p className="text-[11px] text-slate-300 font-bold bg-amber-500/10 border border-amber-500/20 py-1.5 px-3 rounded-xl inline-block font-mono">
                        स्टार्ट रीडिंग : {activeTrip.startKm} KM
                      </p>
                      <p className="text-[10px] text-slate-400 leading-normal pt-1_5">
                        Your Start KM has been logged successfully. The fleet control operations desk is currently compiling your **Movement Authorization Document** and allocating fuel slip details.
                      </p>
                      <div className="text-[9px] text-slate-500 border-t border-white/5 pt-2 font-mono">
                        STATUS: MOVEMENT PENDING
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 5: RUNNING CONTROLS (DELAY / MAINTENANCE DURING TRANSIT) */}
                {activeTrip.status === 'running' && (
                  <div className="bg-slate-900 rounded-2xl p-4 border border-white/5 space-y-4 font-sans text-left">
                    <div className="bg-emerald-950/40 p-3 rounded-lg border border-emerald-500/20 text-center text-emerald-400 text-[10px] font-bold tracking-tight animate-pulse uppercase">
                      🚛 मार्ग में ही है (TRANSIT ACTIVE: IN TRANSIT ROAD RUNNING)
                    </div>

                    {/* LIVE DISPATCH STATISTICS PANEL */}
                    <div className="bg-slate-950 rounded-xl p-3 border border-white/5 space-y-3.5 text-xs text-slate-300">
                      <div className="border-b border-white/5 pb-2">
                        <span className="text-[9px] uppercase font-black text-slate-500 block">वर्तमान मार्ग (Current Transit Segment)</span>
                        <div className="flex items-center justify-between mt-1">
                          <span className="font-bold text-white text-[11px]">{activeTrip.loadingPoint}</span>
                          <span className="text-indigo-400 mx-1 font-mono">➜</span>
                          <span className="font-bold text-white text-[11px]">{activeTrip.unloadingPoint}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pb-1">
                        <div>
                          <span className="text-[9px] uppercase font-black text-slate-500 block">रास्ता / Route Details</span>
                          <span className="font-bold text-white text-[10px] block mt-0.5">NH-44 Express & Eastern Highway</span>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase font-black text-slate-500 block">गंतव्य निर्देशांक (Destination GPS)</span>
                          <span className="font-mono text-emerald-400 text-[10px] block mt-0.5">28.52° N, 77.39° E</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 border-t border-white/5 pt-2.5">
                        <div>
                          <span className="text-[9px] uppercase font-semibold text-slate-500 block">अनुमानित आगमन (Expected Arrival)</span>
                          <span className="font-semibold text-white text-[10px] block mt-0.5">{activeTrip.expectedUnloadingDate || 'Tomorrow 18:00 (कल शाम)'}</span>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase font-semibold text-slate-500 block">उद्देश्य उलटी गिनती (Trip Countdown)</span>
                          <span className="font-mono text-amber-400 font-bold text-[10px] block mt-0.5">06h 45m remaining</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setShowDelay(true)}
                        className="py-3 px-2 bg-slate-800 hover:bg-slate-700 active:scale-95 border border-white/5 rounded-xl font-bold text-amber-400 flex flex-col items-center justify-center gap-1 shadow-sm cursor-pointer text-[10px]"
                      >
                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                        <span>देरी रिपोर्ट / Delay</span>
                      </button>

                      <button
                        onClick={() => setShowMaintenance(true)}
                        className="py-3 px-2 bg-slate-800 hover:bg-slate-700 active:scale-95 border border-white/5 rounded-xl font-bold text-indigo-400 flex flex-col items-center justify-center gap-1 shadow-sm cursor-pointer text-[10px]"
                      >
                        <Wrench className="w-5 h-5 text-indigo-400" />
                        <span>समस्या रिपोर्ट करें / Report Issue</span>
                      </button>
                    </div>

                    <div className="border-t border-white/5 pt-2">
                      <span className="text-[9px] text-slate-500 font-bold block mb-1">गंतव्य पर पहुँचें (Reached Destination?)</span>
                      <button
                        onClick={() => reportUnloadingEvent('unloading_started')}
                        disabled={submittingStep}
                        className="w-full py-3 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer font-mono"
                      >
                        अनलोड पॉइंट पर पहुँच गए (REACHED UNLOADING POINT)
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 6: UNLOADING DISCHARGE */}
                {activeTrip.status === 'unloading_started' && (
                  <div className="bg-slate-900 rounded-2xl p-4 border border-white/5 space-y-3">
                    <h4 className="text-xs font-bold text-slate-100 text-center">📥 अनलोडिंग की समाप्ति (Unloading Verification)</h4>
                    <p className="text-[10px] text-slate-400 text-center">Capture vehicle body after unload process confirms total discharge.</p>

                    <div className="bg-slate-950 p-4 border border-white/5 rounded-xl text-center space-y-2">
                      <div className="relative mx-auto w-24 h-24 bg-slate-900 border border-white/10 rounded-lg overflow-hidden flex items-center justify-center">
                        {unloadingPhoto ? (
                          <img src={unloadingPhoto} alt="Unloaded proof" className="w-full h-full object-cover" />
                        ) : (
                          <Camera className="w-8 h-8 text-slate-600" />
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => capturePhoto(e, 'unloading')}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </div>
                      <span className="text-[9px] text-slate-400 block font-mono">खाली गाड़ी का फ़ोटो (Unloaded photo)</span>
                    </div>

                    <button
                      onClick={() => reportUnloadingEvent('delivered')}
                      disabled={submittingStep}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl cursor-pointer"
                    >
                      {submittingStep ? "अपलोड हो रहा है..." : "अनलोडिंग पूर्ण (Complete Unloading)"}
                    </button>
                  </div>
                )}

                {/* STEP 7: POD (PROOF OF DELIVERY) VERIFICATION CARD */}
                {activeTrip.status === 'delivered' && (
                  <div className="bg-slate-900 rounded-2xl p-4 border border-white/5 space-y-3">
                    <h4 className="text-xs font-extrabold text-teal-400 text-center">📂 POD अपलोड / Submit POD</h4>
                    <p className="text-[10px] text-slate-400 text-center">Provide receiver validation info and sign drawing to unlock dispatch fee.</p>

                    <div className="space-y-3 text-left">
                      {/* POD Camera Section */}
                      <div className="bg-slate-950 p-3 border border-white/5 rounded-xl flex items-center gap-3">
                        <div className="relative w-16 h-16 bg-slate-900 rounded-lg overflow-hidden border border-white/10 flex items-center justify-center">
                          {podPhoto ? (
                            <img src={podPhoto} alt="POD paper" className="w-full h-full object-cover" />
                          ) : (
                            <Camera className="w-6 h-6 text-slate-500" />
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => capturePhoto(e, 'pod')}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                        </div>
                        <div>
                          <strong className="text-slate-200 text-xs block">पीओडी सुपुर्दगी रसीद फ़ोटो</strong>
                          <span className="text-[9px] text-slate-500">Capture signed physical challan receipt/bill doc (Required)</span>
                        </div>
                      </div>

                      {/* Name of receiver */}
                      <div>
                        <label className="text-[10px] text-slate-500 font-bold block mb-1">प्राप्तकर्ता का नाम (Receiver Name)</label>
                        <input
                          type="text"
                          value={receiverName}
                          onChange={(e) => setReceiverName(e.target.value)}
                          placeholder="Manoj Kumar"
                          className="w-full text-xs bg-slate-950 border border-white/10 rounded-lg p-2 text-white focus:outline-none focus:border-teal-500"
                        />
                      </div>

                      {/* Mobile phone of receiver */}
                      <div>
                        <label className="text-[10px] text-slate-500 font-bold block mb-1">मोबाइल नंबर / Receiver Mobile No.</label>
                        <input
                          type="tel"
                          maxLength={10}
                          value={receiverMobile}
                          onChange={(e) => setReceiverMobile(e.target.value.replace(/\D/g, ''))}
                          placeholder="9876543210"
                          className="w-full text-xs font-mono bg-slate-950 border border-white/10 rounded-lg p-2 text-white focus:outline-none focus:border-teal-500"
                        />
                      </div>

                      {/* Interactive Sign */}
                      <div>
                        <label className="text-[10px] text-slate-500 font-bold block mb-1">प्राप्तकर्ता का डिजिटल हस्ताक्षर (Receiver Signature)</label>
                        <SignatureCanvas
                          onSave={(base64) => setReceiverSignature(base64)}
                          placeholder="प्राप्तकर्ता यहाँ साइन करें (Receiver Sign Here)"
                        />
                      </div>
                    </div>

                    <button
                      onClick={submitPod}
                      disabled={submittingStep}
                      className="w-full py-3.5 bg-teal-500 hover:bg-teal-600 active:scale-95 text-slate-900 font-black text-xs rounded-xl mt-3 flex items-center justify-center gap-1.5 cursor-pointer uppercase"
                    >
                      POD अपलोड करें / Submit POD
                    </button>
                  </div>
                )}

                {/* STEP 8: IN POD APPROVAL STATE */}
                {activeTrip.status === 'pod_uploaded' && (
                  <div className="bg-slate-900 rounded-2xl p-6 text-center space-y-3 border border-white/10">
                    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-teal-400 mx-auto animate-pulse">
                      <FileCheck className="w-7 h-7" />
                    </div>
                    <h3 className="text-sm font-bold text-white">POD स्वीकृति की प्रतीक्षा / POD Uploaded</h3>
                    <p className="text-slate-400 text-xs">Waiting for the operations desk to review and approve your uploaded POD document.</p>
                    <div className="text-[10px] bg-slate-950 p-2.5 rounded-lg text-slate-500 border border-white/5 inline-block font-mono">
                      Once operations approves your proof, safety deposits will release.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM NAV BAR */}
        <div className="bg-slate-900 px-6 py-4 rounded-t-3xl border-t border-white/5 flex justify-around text-[10px] uppercase font-bold text-slate-400 font-sans">
          <button
            onClick={() => {
              setShowInspection(false);
              setShowMaintenance(false);
              setShowDelay(false);
            }}
            className="flex flex-col items-center gap-1 text-slate-200 cursor-pointer active:scale-95"
          >
            <Truck className="w-5 h-5 text-emerald-400" />
            <span>यात्रा / Trip</span>
          </button>
          <button
            onClick={() => {
              if (!activeTrip) {
                alert("सक्रिय यात्रा आवश्यक है (Active trip is required to open workshop ticket)");
                return;
              }
              setShowMaintenance(true);
            }}
            className="flex flex-col items-center gap-1 text-slate-400 hover:text-white cursor-pointer active:scale-95"
          >
            <Wrench className="w-5 h-5 text-indigo-400" />
            <span>समस्या / Issue</span>
          </button>
        </div>
      </div>

      {/* ==================== OVERLAY 1: HANDOVER VEHICLE INSPECTION MODAL ==================== */}
      {showInspection && activeTrip && (
        <div className={driverOverlayClass}>
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="text-sm font-black text-rose-400 uppercase tracking-wide">वाहन हैंडओवर निरीक्षण (Handover Checklist)</h2>
              <button
                onClick={() => setShowInspection(false)}
                className="p-1 px-2.5 bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-700 font-bold cursor-pointer"
              >
                X
              </button>
            </div>

            {/* Autofetched details */}
            <div className="bg-slate-900 p-3 rounded-xl border border-white/5 space-y-1 text-slate-300">
              <div className="flex justify-between">
                <span>वाहन नंबर (Vehicle Number):</span>
                <strong className="text-white font-mono">{activeTrip.vehicleNumber}</strong>
              </div>
              <div className="flex justify-between">
                <span>चालक नाम (Driver Name):</span>
                <strong className="text-white">{currentUser.name}</strong>
              </div>
              <div className="flex justify-between">
                <span>दिनांक (Date/Time):</span>
                <strong className="text-white font-mono">{new Date().toLocaleDateString('en-IN')}</strong>
              </div>
            </div>

            {/* Checklist reading inputs */}
            <div>
              <label className="text-xs font-bold text-slate-200 block mb-1">
                ओडोमीटर रीडिंग (Odometer reading) - kms में
              </label>
              <input
                type="number"
                value={odometer || ''}
                onChange={(e) => setOdometer(Number(e.target.value))}
                placeholder="45431"
                className="w-full text-sm font-semibold bg-slate-900 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Checklists items */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">निरीक्षण सूची (Checklist Items)</span>
              <div className="max-h-48 overflow-y-auto space-y-2 bg-slate-900 p-3 rounded-xl border border-white/5 text-slate-200">
                {Object.keys(inspectionChecklist).map((key) => {
                  const itemKey = key as keyof typeof inspectionChecklist;
                  const itemLabels: Record<string, string> = {
                    engineOil: 'इंजन ऑयल ठीक (Engine Oil Match)',
                    coolantWater: 'कूलेंट वाटर पर्याप्त (Coolant OK)',
                    brakeOil: 'ब्रेक ऑयल ठीक (Brake Oil Level)',
                    clutchOil: 'क्लच ऑयल ठीक (Clutch Oil Checked)',
                    powerSteeringOil: 'स्टीयरिंग ऑयल ठीक (Power Steering Oil)',
                    batteryCondition: 'बैटरी चार्ज ठीक (Battery Charged)',
                    headLights: 'हेडलाइट्स चालू (Headlights OK)',
                    indicators: 'इंडिकेटर्स चालू (Indicators OK)',
                    horn: 'हार्न चालू (Horn Checked)',
                    tyresCondition: 'टायर की स्थिति उत्तम (Tyres Grid OK)',
                    stepneyAvailable: 'स्टेपनी उपलब्ध (Stepney available)',
                    toolKitAvailable: 'टूल किट मौजूद (Toolkit available)',
                    jackAvailable: 'जैक उपलब्ध (Jack available)',
                    fireExtinguisher: 'अग्निशामक मौजूद (Fire Extinguisher)',
                    firstAidBox: 'प्राथमिक उपचार बॉक्स (First Aid Kit)',
                  };

                  return (
                    <label key={key} className="flex items-center gap-2 px-1 py-1.5 hover:bg-slate-800 rounded select-none cursor-pointer">
                      <input
                        type="checkbox"
                        checked={inspectionChecklist[itemKey]}
                        onChange={(e) => setInspectionChecklist(prev => ({ ...prev, [itemKey]: e.target.checked }))}
                        className="w-4 h-4 rounded text-indigo-500 focus:ring-0 focus:ring-offset-0 bg-slate-950 border-white/10"
                      />
                      <span className="text-xs">{itemLabels[itemKey as string] || key}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Multiple Photos upload */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">वाहन की तस्वीरें लें (Must upload structural photos)</span>
              <div className="grid grid-cols-2 gap-2 text-slate-300">
                {['front', 'back', 'left', 'right', 'odometer'].map((side) => {
                  const sideKey = side as keyof typeof inspectionPhotos;
                  return (
                    <div key={side} className="bg-slate-900 p-2.5 rounded-xl border border-white/5 flex flex-col items-center text-center space-y-1 relative">
                      <div className="w-12 h-12 rounded bg-slate-950 border border-white/10 overflow-hidden flex items-center justify-center">
                        {inspectionPhotos[sideKey] ? (
                          <img src={inspectionPhotos[sideKey]} alt={side} className="w-full h-full object-cover" />
                        ) : (
                          <Camera className="w-5 h-5 text-slate-600" />
                        )}
                      </div>
                      <span className="text-[9px] uppercase font-mono">{side} photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => capturePhoto(e, `inspect_${side}`)}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sign & Declaration */}
            <div className="space-y-2">
              <label className="flex items-start gap-2 bg-slate-900 p-3 rounded-xl border border-white/5 select-none cursor-pointer text-slate-200">
                <input
                  type="checkbox"
                  checked={declarationAccepted}
                  onChange={(e) => setDeclarationAccepted(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded text-indigo-500 bg-slate-950 border-white/10"
                />
                <span className="text-xs font-medium leading-relaxed">
                  "मैने गाड़ी का भली-भांति निरीक्षण कर लिया है और अपनी जिम्मेदारी स्वीकार करता हूँ।"
                  <strong className="block text-[10px] text-slate-400 mt-1 font-mono uppercase">
                    I inspected the vehicle and accept total driving compliance responsibilities.
                  </strong>
                </span>
              </label>

              <div className="bg-slate-900 p-3 rounded-xl border border-white/5 space-y-2 text-slate-300">
                <span className="text-xs font-bold block">डिजिटल हस्ताक्षर (Digital Signature Required):</span>
                <SignatureCanvas
                  onSave={(base64) => setInspectionSignature(base64)}
                  placeholder="उंगली से हस्ताक्षरित करें (Use finger to sign here)"
                />
              </div>
            </div>
          </div>

          <div className="bg-slate-950 pt-4 pb-2 sticky bottom-0">
            <button
              onClick={submitInspection}
              disabled={submittingStep}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-black text-xs rounded-xl flex items-center justify-center cursor-pointer"
            >
              {submittingStep ? "निरीक्षण पत्र सेव हो रहा है..." : "सुरक्षित करें (SAVE INSPECTION REPORT)"}
            </button>
          </div>
        </div>
      )}

      {/* ==================== OVERLAY 2: DELAY REPORTING MODAL ==================== */}
      {showDelay && activeTrip && (
        <div className={driverOverlayClass}>
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="text-xs font-black text-amber-500 uppercase">देरी रिपोर्ट / Report Delay</h2>
              <button
                onClick={() => setShowDelay(false)}
                className="p-1 px-2 bg-slate-800 text-slate-400 rounded-lg font-bold cursor-pointer"
              >
                X
              </button>
            </div>

            <div className="space-y-4 text-slate-200">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">समस्या कारण / Issue Reason</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { id: 'traffic', l: '🚦 ट्रैफिक (Traffic)' },
                    { id: 'breakdown', l: '🔧 ब्रेकडाउन (Breakdown)' },
                    { id: 'accident', l: '🚨 दुर्घटना (Accident)' },
                    { id: 'rto', l: '👮 RTO चेकपोस्ट (RTO Check)' },
                    { id: 'other', l: '❔ अन्य (Other)' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setDelayReason(item.id as any)}
                      className={`px-2 py-2.5 rounded-xl border font-bold text-center transition-all cursor-pointer ${
                        delayReason === item.id
                          ? 'bg-amber-500 border-amber-600 text-slate-950 shadow-md'
                          : 'bg-slate-900 border-white/5 text-slate-300'
                      }`}
                    >
                      {item.l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">समस्या विवरण / Issue Details</label>
                <textarea
                  value={delayDetails}
                  onChange={(e) => setDelayDetails(e.target.value)}
                  placeholder="जैसे: यमुना एक्सप्रेसवे पर भारी ट्रैफिक जाम..."
                  className="w-full text-xs font-semibold bg-slate-900 border border-white/10 rounded-xl p-3 text-white h-20 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-900 p-2 rounded-xl border border-white/5 flex flex-col items-center">
                  <div className="relative w-12 h-12 bg-slate-950 border border-white/10 flex items-center justify-center rounded">
                    {delayPhoto ? (
                      <img src={delayPhoto} alt="Delay" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-5 h-5 text-slate-600 animate-pulse" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => capturePhoto(e, 'delay')}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                  <span className="text-[9px] text-slate-400 block mt-1">देरी का फ़ोटो (Delay photo)</span>
                </div>

                <div className="bg-slate-900 p-2 rounded-xl border border-white/5 flex items-center justify-center">
                  <AudioRecorder onSave={(base64) => setDelayVoice(base64)} />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button
              onClick={submitDelay}
              className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-slate-900 font-black text-xs rounded-xl cursor-pointer"
            >
              देरी रिपोर्ट भेजें / Submit Delay
            </button>
          </div>
        </div>
      )}

      {/* ==================== OVERLAY 3: VEHICLE ISSUE / MAINTENANCE MODAL ==================== */}
      {showMaintenance && (
        <div className={driverOverlayClass}>
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="text-xs font-extrabold text-indigo-400 uppercase">समस्या रिपोर्ट करें / Report Issue</h2>
              <button
                onClick={() => setShowMaintenance(false)}
                className="p-1 px-2 bg-slate-800 text-slate-400 rounded-lg font-bold cursor-pointer"
              >
                X
              </button>
            </div>

            <div className="space-y-4 text-slate-200">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">समस्या प्रकार / Issue Type</label>
                <div className="grid grid-cols-3 gap-2 text-[10px] font-black uppercase text-center font-mono">
                  {[
                    { id: 'tyre', l: '⭕ Tyre' },
                    { id: 'battery', l: '🔋 Battery' },
                    { id: 'engine', l: '⚙️ Engine' },
                    { id: 'oil', l: '💧 Oil Leak' },
                    { id: 'light', l: '💡 Lights' },
                    { id: 'other', l: '❔ Other' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setMaintIssue(item.id as any)}
                      className={`px-1.5 py-3 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                        maintIssue === item.id
                          ? 'bg-indigo-600 border-indigo-700 text-white font-bold scale-102'
                          : 'bg-slate-900 border-white/5 text-slate-300'
                      }`}
                    >
                      {item.l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">समस्या विवरण / Issue Details</label>
                <textarea
                  value={maintDetails}
                  onChange={(e) => setMaintDetails(e.target.value)}
                  placeholder="जैसे: पीछे का लेफ्ट साइड टायर पंचर हो गया है और जैक ठीक से काम नहीं कर रहा..."
                  className="w-full text-xs font-semibold bg-slate-900 border border-white/10 rounded-xl p-3 text-white h-20 focus:outline-none"
                />
              </div>

              {/* Photo & Audio */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-900 p-2 rounded-xl border border-white/5 flex flex-col items-center text-center">
                  <div className="relative w-12 h-12 bg-slate-950 border border-white/10 flex items-center justify-center rounded">
                    {maintPhoto ? (
                      <img src={maintPhoto} alt="Issue" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-5 h-5 text-slate-600" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => capturePhoto(e, 'maint')}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                  <span className="text-[9px] text-slate-400 block mt-1">समस्या की फोटो (Capture Issue)</span>
                </div>

                <div className="bg-slate-900 overflow-hidden flex items-center justify-center">
                  <AudioRecorder onSave={(base64) => setMaintVoice(base64)} />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button
              onClick={submitMaintenance}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl cursor-pointer"
            >
              समस्या रिपोर्ट करें / Report Issue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
