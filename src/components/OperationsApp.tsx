import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  onSnapshot,
  updateDoc,
  addDoc,
  deleteDoc,
  query,
  where
} from 'firebase/firestore';
import { serverTimestamp } from 'firebase/firestore';
import {
  Layers,
  Users,
  CheckCircle,
  Clock,
  Plus,
  Search,
  Eye,
  AlertTriangle,
  AlertOctagon,
  Wrench,
  Truck,
  Calendar,
  MapPin,
  Map as MapIcon,
  Check,
  X,
  Sparkles,
  Download,
  ShieldAlert,
  ClipboardList,
  ChevronRight,
  Filter,
  Trash2,
  Bell,
  RefreshCw,
  History,
  BarChart3
} from 'lucide-react';
import { DriverMaster, VehicleMaster, TripAssignment, MaintenanceTicket, PodUpload, Notification, LoadingConfirmation, Consignment, PartyMaster, RouteMaster, Movement, OperationsStaffRole, OperationsStaffUser } from '../types';
import { formatTime } from '../utils/imageCompressor';
import { getTruckFlagStyle, truckFlagBadgeClassName } from '../utils/truckFlagStyle';

type OperationsTab = 'dispatch' | 'tracking' | 'drivers' | 'vehicles' | 'workshop' | 'pod' | 'alerts' | 'loading' | 'consignments' | 'reports';

const operationsStaffCollection = () => collection(db, 'users', 'staff', 'accounts');
const operationsStaffRoles: OperationsStaffRole[] = ['Admin', 'Dispatcher', 'Loading Staff', 'LR Staff', 'Accounts', 'Viewer'];
const roleDefaultTab: Record<OperationsStaffRole, OperationsTab> = {
  Admin: 'dispatch',
  Dispatcher: 'tracking',
  'Loading Staff': 'loading',
  'LR Staff': 'consignments',
  Accounts: 'reports',
  Viewer: 'dispatch'
};
const roleAllowedTabs: Record<OperationsStaffRole, OperationsTab[]> = {
  Admin: ['dispatch', 'loading', 'consignments', 'tracking', 'drivers', 'vehicles', 'workshop', 'reports', 'alerts'],
  Dispatcher: ['dispatch', 'tracking', 'vehicles'],
  'Loading Staff': ['loading'],
  'LR Staff': ['consignments'],
  Accounts: ['reports', 'consignments'],
  Viewer: ['dispatch', 'tracking', 'reports']
};

export const normalizeRouteSearchText = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[%.,\-\/\\→⇒➜➝➞➟➠➡↦]+/g, ' ')
    .replace(/\bto\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getRouteSmartDisplayName = (route: RouteMaster): string => {
  if (route.routeName) return route.routeName;
  if (route.fromCity || route.toCity) return [route.fromCity, route.toCity].filter(Boolean).join(' TO ');
  if (route.loadingPoint || route.unloadingPoint) return [route.loadingPoint, route.unloadingPoint].filter(Boolean).join(' TO ');
  return route.routeCode || '';
};

export const getSmartRouteSuggestions = (input: string, routeMasters: RouteMaster[]): RouteMaster[] => {
  const normalizedInput = normalizeRouteSearchText(input);
  if (!normalizedInput) return [];

  const inputWords = normalizedInput.split(' ').filter(Boolean);
  return routeMasters.filter(route => {
    const routeText = normalizeRouteSearchText([
      route.routeName,
      route.fromCity,
      route.toCity,
      route.loadingPoint,
      route.unloadingPoint,
      route.viaRoute,
      route.routeCode
    ].filter(Boolean).join(' '));

    return inputWords.every(word => routeText.includes(word));
  });
};

type RouteSmartSearchInputProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  routeMasters: RouteMaster[];
  placeholder?: string;
  required?: boolean;
};

function RouteSmartSearchInput({
  label,
  value,
  onChange,
  routeMasters,
  placeholder = 'Type route details',
  required = false
}: RouteSmartSearchInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestions = getSmartRouteSuggestions(value, routeMasters).slice(0, 8);

  const handleSelectRoute = (route: RouteMaster) => {
    onChange(getRouteSmartDisplayName(route));
    setShowSuggestions(false);
  };

  return (
    <div className="relative">
      {label && <label className="text-slate-500 font-bold block mb-1">{label}</label>}
      <input
        type="text"
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setShowSuggestions(e.target.value.trim().length > 0);
        }}
        onFocus={() => setShowSuggestions(value.trim().length > 0)}
        onBlur={() => {
          setTimeout(() => setShowSuggestions(false), 150);
        }}
        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
      />
      {showSuggestions && value.trim() !== '' && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl mt-1 max-h-44 overflow-auto text-[12px] shadow-lg">
          {suggestions.map(route => {
            const routeName = getRouteSmartDisplayName(route);
            return (
              <li
                key={route.id}
                onMouseDown={(evt) => {
                  evt.preventDefault();
                  handleSelectRoute(route);
                }}
                className="px-3 py-2 cursor-pointer hover:bg-slate-50"
              >
                <div className="font-semibold text-slate-900">{routeName}</div>
                <div className="text-[11px] text-slate-500">
                  {[route.routeCode, route.fromCity, route.toCity, route.viaRoute].filter(Boolean).join(' • ')}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function OperationsApp() {
  const [activeTab, setActiveTab] = useState<OperationsTab>('dispatch');
  const [currentStaff, setCurrentStaff] = useState<OperationsStaffUser | null>(() => {
    const cached = localStorage.getItem('dnk_operations_staff');
    if (!cached) return null;
    try {
      return JSON.parse(cached) as OperationsStaffUser;
    } catch (err) {
      console.error('Operations staff cache read failed', err);
      return null;
    }
  });
  const [staffLoginForm, setStaffLoginForm] = useState({ username: '', password: '' });
  const [staffLoginError, setStaffLoginError] = useState('');
  const [bootstrapAdminForm, setBootstrapAdminForm] = useState({
    staffName: '',
    username: '',
    password: '',
    confirmPassword: ''
  });
  const [bootstrapAdminError, setBootstrapAdminError] = useState('');
  const [staffUsers, setStaffUsers] = useState<OperationsStaffUser[]>([]);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState({
    staffName: '',
    username: '',
    password: '',
    role: 'Viewer' as OperationsStaffRole,
    status: 'Active' as 'Active' | 'Inactive'
  });

  // Iframe-safe toast notifications & confirm dialogue overlays
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }[]>([]);
  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    const id = Date.now().toString() + Math.random().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const askConfirmation = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(null);
      }
    });
  };

  // Firestore local state bindings
  const [drivers, setDrivers] = useState<DriverMaster[]>([]);
  const [vehicles, setVehicles] = useState<VehicleMaster[]>([]);
  const [trips, setTrips] = useState<TripAssignment[]>([]);
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [pods, setPods] = useState<PodUpload[]>([]);
  const [alerts, setAlerts] = useState<Notification[]>([]);
  const [loadingConfirmations, setLoadingConfirmations] = useState<LoadingConfirmation[]>([]);
  const [consignments, setConsignments] = useState<Consignment[]>([]);
  const [partyMasters, setPartyMasters] = useState<PartyMaster[]>([]);
  const [routeMasters, setRouteMasters] = useState<RouteMaster[]>([]);

  useEffect(() => {
    console.log('Merged Party Masters count:', partyMasters.length);
  }, [partyMasters]);

  // Helper: generate next Route Code (RT0001) by inspecting both legacy and new collections
  const generateRouteCode = async (): Promise<string> => {
    try {
      const codes: string[] = [];
      const snaps = await Promise.all([
        getDocs(collection(db, 'routeMaster')),
        getDocs(collection(db, 'routes'))
      ]);
      for (const s of snaps) {
        s.docs.forEach(d => {
          const data: any = d.data();
          if (data.routeCode && typeof data.routeCode === 'string') codes.push(data.routeCode);
          if (data.routeName && typeof data.routeName === 'string' && typeof data.routeCode === 'undefined') {
            // no-op; rely on explicit routeCode when available
          }
        });
      }
      // Determine max numeric suffix
      const nums = codes.map(c => {
        const m = c.match(/RT0*(\d+)$/i);
        return m ? parseInt(m[1], 10) : 0;
      });
      const max = nums.length ? Math.max(...nums) : 0;
      const next = (max + 1).toString().padStart(4, '0');
      return `RT${next}`;
    } catch (err) {
      console.error('Route code generation failed:', err);
      // Fallback random
      const r = Math.floor(1 + Math.random() * 9999).toString().padStart(4, '0');
      return `RT${r}`;
    }
  };
  const [movements, setMovements] = useState<Movement[]>([]);
  const [statusAudits, setStatusAudits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activitySearch, setActivitySearch] = useState('');
  const [activityFilter, setActivityFilter] = useState<'all' | 'LOADING FIND' | 'LOADING CONFIRM' | 'LOADING DONE' | 'MOVEMENT PENDING' | 'RUNNING' | 'LATE' | 'UNLOADING REPORTING' | 'UNLOADING DONE' | 'MAINTENANCE'>('all');
  const [activityRefreshTick, setActivityRefreshTick] = useState(0);
  // Loading confirmation vehicle search/autocomplete
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [showVehicleSuggestions, setShowVehicleSuggestions] = useState(false);
  const [vehicleNotAvailable, setVehicleNotAvailable] = useState<string | null>(null);
  const [selectedLoadingVehicle, setSelectedLoadingVehicle] = useState<VehicleMaster | null>(null);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState<number>(-1);

  const clearSelectedLoadingVehicle = () => {
    setSelectedLoadingVehicle(null);
    setNewLoading(prev => ({
      ...prev,
      vehicleNo: '',
      vehicleType: '',
      driverName: '',
      driverMobile: ''
    }));
    setVehicleNotAvailable(null);
  };

  const clearVehicleAutocomplete = () => {
    setVehicleSearch('');
    setShowVehicleSuggestions(false);
    setHighlightedSuggestionIndex(-1);
    clearSelectedLoadingVehicle();
  };

  // Helper to update vehicle status Flag and log audit history in Firestore
  const logVehicleStatusChange = async (vehicleNo: string, newFlag: 'LOADING FIND' | 'LOADING CONFIRM' | 'LOADING DONE' | 'MOVEMENT PENDING' | 'RUNNING' | 'LATE' | 'UNLOADING REPORTING' | 'UNLOADING DONE', tripId?: string, remarks?: string) => {
    if (!vehicleNo) return;
    try {
      const normVehicleNo = vehicleNo.trim().toUpperCase();
      const vQuery = query(collection(db, 'vehicles'), where('vehicleNumber', '==', normVehicleNo));
      const vSnapshot = await getDocs(vQuery);
      if (!vSnapshot.empty) {
        const vDoc = vSnapshot.docs[0];
        // Log before update
        console.log('Vehicle Before Status', { vehicleNumber: normVehicleNo, beforeStatus: vDoc.data()?.statusFlag });

        // Update vehicle status and set updatedAt timestamp
        await updateDoc(doc(db, 'vehicles', vDoc.id), {
          statusFlag: newFlag,
          updatedAt: serverTimestamp()
        });

        // Read back the updated document and log the result
        try {
          const updatedSnap = await getDoc(doc(db, 'vehicles', vDoc.id));
          console.log('Vehicle After Status', { vehicleNumber: normVehicleNo, afterStatus: updatedSnap.data()?.statusFlag });
        } catch (readErr) {
          console.warn('Vehicle After Status read failed', readErr);
        }

        console.log('Firestore Update Success', { vehicleId: vDoc.id, vehicleNumber: normVehicleNo, newStatus: newFlag });
      }

      const auditId = `audit_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
      const auditPayload = {
        id: auditId,
        vehicleNumber: normVehicleNo,
        tripId: tripId || '',
        newStatus: newFlag,
        timestamp: new Date().toISOString(),
        remarks: remarks || '',
        recordedBy: 'Operations Portal'
      };
      await setDoc(doc(db, 'vehicleStatusAudit', auditId), auditPayload);
    } catch (err) {
      console.error("Error logging vehicle status change:", err);
    }
  };

  const normalizeVehicleNumber = (vehicleNumber: string = '') => vehicleNumber.trim().toUpperCase();
  const isVehicleActive = (vehicle?: VehicleMaster | null) => (vehicle?.recordStatus || 'Active') === 'Active';

  const getVehicleDisplayStatus = (vehicle: VehicleMaster) => {
    const hasMaintenance = tickets.some(
      (ticket) => normalizeVehicleNumber(ticket.vehicleNumber) === normalizeVehicleNumber(vehicle.vehicleNumber) && ticket.status === 'open'
    );
    if (hasMaintenance) return 'MAINTENANCE' as const;

    const normVeh = normalizeVehicleNumber(vehicle.vehicleNumber);
    const driverAssigned = Boolean(vehicle.linkedDriverId || vehicle.linkedDriverName);

    // Find active trip for this vehicle (non-completed)
    const activeTrip = trips.find(t => normalizeVehicleNumber(t.vehicleNumber) === normVeh && t.status !== 'completed');

    if (!driverAssigned) {
      return 'WITHOUT DRIVER' as const;
    }

    // If vehicle has explicit statusFlag, prefer it (but ensure it's not undefined)
    if (vehicle.statusFlag) return vehicle.statusFlag as any;

    // Driver assigned, but no active trip => LOADING FIND
    if (!activeTrip) return 'LOADING FIND' as const;

    // Derive from trip status
    switch (activeTrip.status) {
      case 'assigned':
      case 'inspected':
        return 'LOADING FIND' as const;
      case 'loading_started':
        return 'LOADING CONFIRM' as const;
      case 'loaded':
        return 'LOADING DONE' as const;
      case 'movement_pending':
        return 'MOVEMENT PENDING' as const;
      case 'running':
        return 'RUNNING' as const;
      case 'unloading_started':
        return 'UNLOADING REPORTING' as const;
      case 'delivered':
      case 'pod_uploaded':
        return 'UNLOADING DONE' as const;
      case 'completed':
        return 'LOADING FIND' as const;
      default:
        return 'LOADING FIND' as const;
    }
  };

  const parseEtaDeadline = (trip: TripAssignment) => {
    if (!trip?.eta) return null;
    const normalized = trip.eta.trim();
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const hoursMatch = normalized.match(/(\d+)\s*hours?/i);
    if (hoursMatch && trip.assignedDate) {
      const assigned = new Date(trip.assignedDate);
      if (!Number.isNaN(assigned.getTime())) {
        return new Date(assigned.getTime() + Number(hoursMatch[1]) * 60 * 60 * 1000);
      }
    }
    const daysMatch = normalized.match(/(\d+)\s*days?/i);
    if (daysMatch && trip.assignedDate) {
      const assigned = new Date(trip.assignedDate);
      if (!Number.isNaN(assigned.getTime())) {
        return new Date(assigned.getTime() + Number(daysMatch[1]) * 24 * 60 * 60 * 1000);
      }
    }
    return null;
  };

  const formatDelayDuration = (deadline: Date | null) => {
    if (!deadline) return '—';
    const diffMs = Date.now() - deadline.getTime();
    if (diffMs <= 0) return '—';
    const diffMinutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  const getLatestMovementForVehicle = (vehicleNumber: string) => {
    const normalized = normalizeVehicleNumber(vehicleNumber);
    return movements
      .filter((m) => normalizeVehicleNumber(m.vehicleNumber) === normalized)
      .sort((a, b) => {
        const aTime = new Date(`${a.startDate || ''}T${a.startTime || '00:00'}`);
        const bTime = new Date(`${b.startDate || ''}T${b.startTime || '00:00'}`);
        return bTime.getTime() - aTime.getTime();
      })[0];
  };

  const handleViewActivityTab = (tab: 'vehicles' | 'drivers' | 'consignments' | 'tracking' | 'pod', query?: string) => {
    setActiveTab(tab);
    setSearchQuery(query || '');
  };

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [consignmentSearchQuery, setConsignmentSearchQuery] = useState('');
  const [consignmentActiveSubTab, setConsignmentActiveSubTab] = useState<'list' | 'parties' | 'routes'>('list');
  const [consignmentRecordStatusFilter, setConsignmentRecordStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [isEditingConsignmentForm, setIsEditingConsignmentForm] = useState(false);
  const [partySearchQuery, setPartySearchQuery] = useState('');
  const [routeSearchQuery, setRouteSearchQuery] = useState('');
  const [reportsActiveSubTab, setReportsActiveSubTab] = useState<'audits' | 'movements'>('audits');
  const [reportsSearchQuery, setReportsSearchQuery] = useState('');
  const [workshopFilter, setWorkshopFilter] = useState<string>('all');

  const getVehicleDriver = (vehicle: VehicleMaster) => {
    const normalized = normalizeVehicleNumber(vehicle.vehicleNumber);
    return drivers.find((driver) =>
      normalizeVehicleNumber(driver.linkedVehicleNumber || '') === normalized ||
      driver.linkedVehicleId === vehicle.id
    );
  };

  const getVehicleTrip = (vehicle: VehicleMaster) => {
    return trips.find((trip) => normalizeVehicleNumber(trip.vehicleNumber) === normalizeVehicleNumber(vehicle.vehicleNumber));
  };

  const getVehicleBadge = (vehicle: VehicleMaster) => {
    const status = getVehicleDisplayStatus(vehicle);
    return {
      label: status,
      style: getTruckFlagStyle(status)
    };
  };

  const getDelayText = (trip: TripAssignment | undefined) => {
    if (!trip) return '—';
    const deadline = parseEtaDeadline(trip);
    if (!deadline) return '—';
    const diffMs = Date.now() - deadline.getTime();
    if (diffMs <= 0) return '—';
    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  const getVehicleMovements = (vehicleNumber: string) => {
    const normalized = normalizeVehicleNumber(vehicleNumber);
    return movements
      .filter((movement) => normalizeVehicleNumber(movement.vehicleNumber) === normalized)
      .sort((a, b) => {
        const aTime = new Date(`${a.startDate || ''}T${a.startTime || '00:00'}`);
        const bTime = new Date(`${b.startDate || ''}T${b.startTime || '00:00'}`);
        return bTime.getTime() - aTime.getTime();
      })[0];
  };

  const maintenanceVehicleSet = new Set(
    tickets
      .filter((ticket) => ticket.status === 'open')
      .map((ticket) => normalizeVehicleNumber(ticket.vehicleNumber))
  );

  const totalVehicles = vehicles.length;

  const activityRows = vehicles
    .map((vehicle) => {
      const trip = getVehicleTrip(vehicle);
      const driver = getVehicleDriver(vehicle);
      const movement = getVehicleMovements(vehicle.vehicleNumber);
      const status = getVehicleDisplayStatus(vehicle);
      const etaDeadline = trip ? parseEtaDeadline(trip) : null;
      const currentLocation = trip?.currentLat && trip?.currentLng
        ? `${trip.currentLat.toFixed(4)}, ${trip.currentLng.toFixed(4)}`
        : 'N/A';
      const startKm = trip?.startKm?.toString() || movement?.startKm || '—';
      const currentKm = (trip as any)?.currentKm?.toString() || (movement as any)?.currentKm || '—';
      const tripDuration = (() => {
        const startAt = movement?.startDate && movement?.startTime
          ? new Date(`${movement.startDate}T${movement.startTime}`)
          : trip?.assignedDate ? new Date(trip.assignedDate) : null;
        if (!startAt || Number.isNaN(startAt.getTime())) return '—';
        const diffMs = Date.now() - startAt.getTime();
        const hours = Math.floor(diffMs / 3600000);
        const minutes = Math.floor((diffMs % 3600000) / 60000);
        return `${hours}h ${minutes}m`;
      })();
      return {
        vehicle,
        trip,
        driver,
        movement,
        status,
        etaDeadline,
        etaLabel: trip?.eta || 'N/A',
        lateBy: getDelayText(trip),
        currentLocation,
        startKm,
        currentKm,
        tripDuration,
        lastUpdated: trip?.lastLocationTime || trip?.assignedDate || vehicle.createdAt || 'N/A'
      };
    })
    .filter((row) => {
      if (activityFilter !== 'all' && row.status !== activityFilter) return false;
      if (!activitySearch.trim()) return true;
      const q = activitySearch.toLowerCase();
      return [
        row.vehicle.vehicleNumber,
        row.driver?.name,
        row.driver?.mobile,
        row.trip?.loadingPoint,
        row.trip?.unloadingPoint
      ].some((value) => value?.toLowerCase().includes(q));
    });

  // Loading Confirmation state
  const [showAddLoading, setShowAddLoading] = useState(false);
  const [showEditLoading, setShowEditLoading] = useState(false);
  const [editingLoading, setEditingLoading] = useState<LoadingConfirmation | null>(null);
  const [selectedLoadingParty, setSelectedLoadingParty] = useState<PartyMaster | null>(null);
  const [showPartySuggestions, setShowPartySuggestions] = useState(false);
  const [highlightedPartySuggestionIndex, setHighlightedPartySuggestionIndex] = useState(-1);
  const [newLoading, setNewLoading] = useState({
    tripId: '',
    loadingPointLocation: '',
    partyVendorInfo: '',
    routeDetails: '',
    weightDetails: '',
    isLoadingConfirmed: false,
    status: 'pending' as 'pending' | 'confirmed' | 'cancelled',
    // New fields
    loadingNo: '',
    vehicleNo: '',
    vehicleType: '',
    driverName: '',
    driverMobile: '',
    loadingParty: '',
    loadingAddress: '',
    loadingContactPerson: '',
    loadingMobile: '',
    partyType: '',
    partyPlaceCity: '',
    googleMapLocation: '',
    loadingDate: '',
    loadingTime: '',
    remarks: ''
  });

  // Consignment state
  const [showAddConsignment, setShowAddConsignment] = useState(false);
  const [showEditConsignment, setShowEditConsignment] = useState(false);
  const [editingConsignment, setEditingConsignment] = useState<Consignment | null>(null);

  // Movement compilation state
  const [showAddMovement, setShowAddMovement] = useState(false);
  const [selectedTripForMovement, setSelectedTripForMovement] = useState<TripAssignment | null>(null);
  const [newMovement, setNewMovement] = useState({
    movementId: '',
    vehicleNumber: '',
    driverName: '',
    loadingConfirmNo: '',
    lrNumber: '',
    routeDetails: '',
    consigneeName: '',
    consigneeMobile: '',
    unloadingPoint: '',
    unloadingGoogleMapLocation: '',
    eWayBillNumber: '',
    eWayBillExpiryDate: '',
    reportingDate: '',
    reportingTime: '',
    startKm: '',
    endKm: '',
    expectedArrivalDate: '',
    expectedArrivalTime: '',
    fuelIssuedLiters: '',
    fuelCashCard: 'cash'
  });
  
  // Design Themes & Bilingual Customisation Options 
  const [accentColor, setAccentColor] = useState<'indigo' | 'emerald' | 'rose' | 'amber' | 'violet' | 'slate'>('indigo');
  const [languageMode, setLanguageMode] = useState<'bilingual' | 'english' | 'hindi'>('bilingual');
  
  // Manual Party and Route Master Creations
  const [newMasterPartyName, setNewMasterPartyName] = useState('');
  const [newMasterPartyMobile, setNewMasterPartyMobile] = useState('');
  const [showAddPartyMaster, setShowAddPartyMaster] = useState(false);
  const [showPartyMasterModal, setShowPartyMasterModal] = useState(false);
  const [editingParty, setEditingParty] = useState<PartyMaster | null>(null);
  const [partyStatusFilter, setPartyStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'BLACKLISTED'>('ALL');
  const [partyTypeFilter, setPartyTypeFilter] = useState<'ALL' | 'CLIENT' | 'BROKER'>('ALL');
  const [partyPlaceFilter, setPartyPlaceFilter] = useState<'ALL' | string>('ALL');
  const [partyForm, setPartyForm] = useState({
    partyName: '',
    partyType: 'CLIENT' as 'CLIENT' | 'BROKER',
    placeCity: '',
    state: '',
    broker: '',
    contactPerson: '',
    mobileNumber: '',
    alternateMobileNumber: '',
    email: '',
    additionalContacts: [{ id: 'contact_1', name: '', mobile: '', email: '' }],
    gstNumber: '',
    panNumber: '',
    billingAddress: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' | 'BLACKLISTED',
    documentsSent: 'Yes' as 'Yes' | 'No',
    courierCompany: '',
    docketNumber: '',
    dispatchDate: '',
    sentBy: '',
    receiverName: '',
    receivedDate: '',
    receivedTime: '',
    remarks: ''
  });
  const [newMasterLoading, setNewMasterLoading] = useState('');
  const [newMasterUnloading, setNewMasterUnloading] = useState('');
  const [showAddRouteMaster, setShowAddRouteMaster] = useState(false);
  const [showRouteMasterModal, setShowRouteMasterModal] = useState(false);
  const [editingRoute, setEditingRoute] = useState<RouteMaster | null>(null);
  const [routeForm, setRouteForm] = useState({
    routeName: '',
    fromCity: '',
    toCity: '',
    viaRoute: '',
    distanceKm: '',
    transitHours: '',
    recordStatus: 'Active' as 'Active' | 'Inactive'
  });
  const [selectedLrForPrint, setSelectedLrForPrint] = useState<Consignment | null>(null);

  const resetPartyForm = () => {
    setPartyForm({
      partyName: '',
      partyType: 'CLIENT',
      placeCity: '',
      state: '',
      broker: '',
      contactPerson: '',
      mobileNumber: '',
      alternateMobileNumber: '',
      email: '',
      additionalContacts: [{ id: 'contact_1', name: '', mobile: '', email: '' }],
      gstNumber: '',
      panNumber: '',
      billingAddress: '',
      status: 'ACTIVE',
      documentsSent: 'Yes',
      courierCompany: '',
      docketNumber: '',
      dispatchDate: '',
      sentBy: '',
      receiverName: '',
      receivedDate: '',
      receivedTime: '',
      remarks: ''
    });
    setEditingParty(null);
  };

  const [newConsignment, setNewConsignment] = useState({
    tripId: '',
    loadingConfirmationId: '',
    lrNumber: '',
    lrDate: '',
    consignorName: '',
    consignorMobile: '',
    consigneeName: '',
    consigneeMobile: '',
    billingParty: '',
    vehicleNumber: '',
    driverName: '',
    routeDetails: '',
    materialDescription: '',
    quantity: '',
    weightTons: '',
    freightAmount: '',
    advanceAmount: '',
    remarks: '',
    paymentTerms: 'paid' as 'paid' | 'to_pay' | 'to_be_billed'
  });

  // Input states for creators
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [newDriver, setNewDriver] = useState({
    name: '',
    mobile: '',
    alternateMobile: '',
    address: '',
    aadhaarNumber: '',
    panNumber: '',
    drivingLicenceNumber: '',
    licenceExpiryDate: '',
    joiningDate: new Date().toISOString().split('T')[0],
    linkedVehicleId: '',
    loginOtp: '',
    otpActive: true
  });

  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [newVehicle, setNewVehicle] = useState({
    vehicleNumber: '',
    vehicleType: 'HCV Multi-axle Heavy Truck',
    ownershipType: 'owned' as 'owned' | 'attached',
    ownerName: '',
    ownerMobile: '',
    chassisNumber: '',
    engineNumber: '',
    capacity: '24 Tons',
    rcExpiry: '',
    insuranceExpiry: '',
    fitnessExpiry: '',
    permitExpiry: '',
    pucExpiry: '',
    linkedDriverId: ''
  });

  // Input states for editing
  const [showEditDriver, setShowEditDriver] = useState(false);
  const [editingDriver, setEditingDriver] = useState<DriverMaster | null>(null);
  const [driverListSearch, setDriverListSearch] = useState('');
  const [isViewOnlyDriver, setIsViewOnlyDriver] = useState(false);

  const [showEditVehicle, setShowEditVehicle] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<VehicleMaster | null>(null);
  const [vehicleListSearch, setVehicleListSearch] = useState('');
  const [isViewOnlyVehicle, setIsViewOnlyVehicle] = useState(false);

  const [showAssignTrip, setShowAssignTrip] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [newTrip, setNewTrip] = useState({
    vehicleNumber: '',
    driverId: '',
    loadingPoint: '',
    unloadingPoint: '',
    eta: '24 Hours'
  });
  const [loadingHistorySearch, setLoadingHistorySearch] = useState('');
  const [loadingHistoryFilter, setLoadingHistoryFilter] = useState<'all' | 'confirmed' | 'pending' | 'cancelled' | 'map_saved' | 'map_missing'>('all');
  const [lrHistorySearch, setLrHistorySearch] = useState('');
  const [lrHistoryFilter, setLrHistoryFilter] = useState<'all' | 'paid' | 'to_pay' | 'to_be_billed'>('all');
  const [tripHistorySearch, setTripHistorySearch] = useState('');
  const [tripHistoryFilter, setTripHistoryFilter] = useState<'all' | 'assigned' | 'running' | 'completed' | 'late'>('all');
  const [movementHistorySearch, setMovementHistorySearch] = useState('');
  const [movementHistoryFilter, setMovementHistoryFilter] = useState<'all' | 'running' | 'completed'>('all');

  useEffect(() => {
    if (!showAddLoading && !showEditLoading && !showAddConsignment && !showAssignTrip) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showAddLoading, showEditLoading, showAddConsignment, showAssignTrip]);

  const getAllowedTabsForStaff = (staff: OperationsStaffUser | null): OperationsTab[] => {
    if (!staff) return [];
    return roleAllowedTabs[staff.role] || roleAllowedTabs.Viewer;
  };

  const canStaffAccessTab = (tab: OperationsTab) => {
    if (!currentStaff) return false;
    return getAllowedTabsForStaff(currentStaff).includes(tab);
  };

  const openOperationsTab = (tab: OperationsTab) => {
    if (!canStaffAccessTab(tab)) {
      showToast('You do not have access to this module.', 'warning');
      return;
    }
    setActiveTab(tab);
  };

  useEffect(() => {
    if (!currentStaff) return;
    if (!canStaffAccessTab(activeTab)) {
      setActiveTab(roleDefaultTab[currentStaff.role] || 'dispatch');
    }
  }, [currentStaff, activeTab]);

  const handleOperationsStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const username = staffLoginForm.username.trim();
    const password = staffLoginForm.password;
    setStaffLoginError('');
    if (!username || !password) {
      setStaffLoginError('Username and password are required.');
      return;
    }

    try {
      const staffQuery = query(operationsStaffCollection(), where('username', '==', username));
      const staffSnap = await getDocs(staffQuery);
      const staffDoc = staffSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as OperationsStaffUser))
        .find((staff) => staff.username === username);

      if (!staffDoc || staffDoc.password !== password || staffDoc.status !== 'Active') {
        setStaffLoginError('Invalid username/password or inactive staff account.');
        return;
      }

      setCurrentStaff(staffDoc);
      localStorage.setItem('dnk_operations_staff', JSON.stringify(staffDoc));
      setActiveTab(roleDefaultTab[staffDoc.role] || 'dispatch');
    } catch (err) {
      console.error('Operations staff login failed', err);
      setStaffLoginError('Unable to login. Please check Firestore connection.');
    }
  };

  const handleBootstrapAdminSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    const staffName = bootstrapAdminForm.staffName.trim();
    const username = bootstrapAdminForm.username.trim();
    const password = bootstrapAdminForm.password;
    const confirmPassword = bootstrapAdminForm.confirmPassword;
    setBootstrapAdminError('');

    if (!staffName || !username || !password || !confirmPassword) {
      setBootstrapAdminError('All fields are required.');
      return;
    }
    if (password !== confirmPassword) {
      setBootstrapAdminError('Password and confirm password do not match.');
      return;
    }

    try {
      const latestStaffSnap = await getDocs(operationsStaffCollection());
      if (!latestStaffSnap.empty) {
        setBootstrapAdminError('Admin setup is already complete. Please login.');
        return;
      }

      const now = new Date().toISOString();
      const payload: OperationsStaffUser = {
        id: username,
        staffName,
        username,
        password,
        role: 'Admin',
        status: 'Active',
        createdAt: now
      };

      await setDoc(doc(db, 'users', 'staff', 'accounts', username), payload);
      setBootstrapAdminForm({ staffName: '', username: '', password: '', confirmPassword: '' });
      setStaffLoginForm({ username, password: '' });
      setStaffLoginError('Bootstrap admin created. Please login.');
    } catch (err) {
      console.error('Bootstrap admin setup failed', err);
      setBootstrapAdminError('Failed to create bootstrap admin. Please check Firestore connection.');
    }
  };

  const handleOperationsStaffLogout = () => {
    setCurrentStaff(null);
    localStorage.removeItem('dnk_operations_staff');
    setStaffLoginForm({ username: '', password: '' });
    setStaffLoginError('');
  };

  const resetStaffForm = () => {
    setEditingStaffId(null);
    setStaffForm({
      staffName: '',
      username: '',
      password: '',
      role: 'Viewer',
      status: 'Active'
    });
  };

  const handleEditStaffUser = (staff: OperationsStaffUser) => {
    setEditingStaffId(staff.id);
    setStaffForm({
      staffName: staff.staffName || '',
      username: staff.username || '',
      password: staff.password || '',
      role: staff.role || 'Viewer',
      status: staff.status || 'Active'
    });
  };

  const handleSaveStaffUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStaff || currentStaff.role !== 'Admin') {
      showToast('Only Admin can manage Staff/User records.', 'warning');
      return;
    }
    const username = staffForm.username.trim();
    if (!staffForm.staffName.trim() || !username || !staffForm.password.trim()) {
      showToast('Staff name, username, and password are required.', 'warning');
      return;
    }

    try {
      const staffId = `staff_${username.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const existing = staffUsers.find((staff) => staff.username === username && staff.id !== editingStaffId);
      if (existing) {
        showToast('Username already exists.', 'error');
        return;
      }

      const now = new Date().toISOString();
      const payload: OperationsStaffUser = {
        id: staffId,
        staffName: staffForm.staffName.trim(),
        username,
        password: staffForm.password,
        role: staffForm.role,
        status: staffForm.status,
        createdAt: staffUsers.find((staff) => staff.id === editingStaffId)?.createdAt || now,
        updatedAt: now
      };

      await setDoc(doc(db, 'users', 'staff', 'accounts', staffId), payload);
      if (editingStaffId && editingStaffId !== staffId) {
        await deleteDoc(doc(db, 'users', 'staff', 'accounts', editingStaffId));
      }
      resetStaffForm();
      showToast(editingStaffId ? 'Staff/User updated.' : 'Staff/User created.', 'success');
    } catch (err) {
      console.error('Staff/User save failed', err);
      showToast('Failed to save Staff/User.', 'error');
    }
  };

  const handleToggleStaffStatus = async (staff: OperationsStaffUser) => {
    if (!currentStaff || currentStaff.role !== 'Admin') {
      showToast('Only Admin can update Staff/User status.', 'warning');
      return;
    }
    try {
      const nextStatus = staff.status === 'Active' ? 'Inactive' : 'Active';
      await updateDoc(doc(db, 'users', 'staff', 'accounts', staff.id), {
        status: nextStatus,
        updatedAt: new Date().toISOString()
      });
      showToast(`Staff/User marked ${nextStatus}.`, 'success');
    } catch (err) {
      console.error('Staff/User status update failed', err);
      showToast('Failed to update Staff/User status.', 'error');
    }
  };

  // Rejection details overlay container
  const [rejectingPodId, setRejectingPodId] = useState<string | null>(null);
  const [podRejectionReason, setPodRejectionReason] = useState('');

  // Real-time synchronization
  useEffect(() => {
    setLoading(true);

    const checkAndSync = () => {
      const unsubDrivers = onSnapshot(collection(db, 'drivers'), (snapshot) => {
        const list: DriverMaster[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as DriverMaster));
        setDrivers(list);
      });

      const unsubVehicles = onSnapshot(collection(db, 'vehicles'), (snapshot) => {
        const list: VehicleMaster[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as VehicleMaster));
        setVehicles(list);
      });

      const unsubTrips = onSnapshot(collection(db, 'tripAssignments'), (snapshot) => {
        const list: TripAssignment[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as TripAssignment));
        setTrips(list);
      });

      const unsubTickets = onSnapshot(collection(db, 'maintenanceTickets'), (snapshot) => {
        const list: MaintenanceTicket[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as MaintenanceTicket));
        setTickets(list);
      });

      const unsubPods = onSnapshot(collection(db, 'podUploads'), (snapshot) => {
        const list: PodUpload[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as PodUpload));
        setPods(list);
      });

      const unsubAlerts = onSnapshot(collection(db, 'notifications'), (snapshot) => {
        const list: Notification[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as Notification));
        setAlerts(list.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      });

      const unsubLoadingConfirmations = onSnapshot(collection(db, 'loadingConfirmations'), (snapshot) => {
        const list: LoadingConfirmation[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as LoadingConfirmation));
        setLoadingConfirmations(list);
      });

      const unsubConsignments = onSnapshot(collection(db, 'consignments'), (snapshot) => {
        const list: Consignment[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as Consignment));
        setConsignments(list);
        setLoading(false);
      });

      const unsubPartiesLegacy = onSnapshot(collection(db, 'partyMaster'), (snapshot) => {
        const list: PartyMaster[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as PartyMaster));
        console.log('Party Count Loaded from partyMaster:', list.length);
        setPartyMasters(prev => {
          const map = new Map(prev.map(p => [p.id, p]));
          for (const party of list) map.set(party.id, party);
          return Array.from(map.values());
        });
      });

      const unsubParties = onSnapshot(collection(db, 'parties'), (snapshot) => {
        const list: PartyMaster[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as PartyMaster));
        console.log('Party Count Loaded from parties:', list.length);
        setPartyMasters(prev => {
          const map = new Map(prev.map(p => [p.id, p]));
          for (const party of list) map.set(party.id, party);
          return Array.from(map.values());
        });
      });

      // Listen to both legacy `routeMaster` and new `routes` collection and merge results
      const unsubRoutesLegacy = onSnapshot(collection(db, 'routeMaster'), (snapshot) => {
        const list: RouteMaster[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as RouteMaster));
        setRouteMasters(prev => {
        const map = new Map(prev.map(r => [r.routeCode || r.id, r]));
        for (const it of list) map.set(it.routeCode || it.id, it);
          return Array.from(map.values());
        });
      });

      const unsubRoutesNew = onSnapshot(collection(db, 'routes'), (snapshot) => {
        const list: RouteMaster[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as RouteMaster));
        setRouteMasters(prev => {
        const map = new Map(prev.map(r => [r.routeCode || r.id, r]));
        for (const it of list) map.set(it.routeCode || it.id, it);
          return Array.from(map.values());
        });
      });

      const unsubMovements = onSnapshot(collection(db, 'movements'), (snapshot) => {
        const list: Movement[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as Movement));
        setMovements(list);
      });

      const unsubAudits = onSnapshot(collection(db, 'vehicleStatusAudit'), (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setStatusAudits(list);
      });

      const unsubStaffUsers = onSnapshot(operationsStaffCollection(), (snapshot) => {
        const list: OperationsStaffUser[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as OperationsStaffUser));
        setStaffUsers(list.sort((a, b) => a.staffName.localeCompare(b.staffName)));
      });

      // Periodic checker for LATE trips and AUTO RESET of vehicles (15 minutes after unloading complete)
      const intervalId = setInterval(async () => {
        try {
          const now = new Date();
          const tripsSnap = await getDocs(collection(db, 'tripAssignments'));
          const vehiclesSnap = await getDocs(collection(db, 'vehicles'));
          const movementsSnap = await getDocs(collection(db, 'movements'));
          const auditSnap = await getDocs(collection(db, 'vehicleStatusAudit'));
          const alertsSnap = await getDocs(collection(db, 'notifications'));

          const tripsList = tripsSnap.docs.map(doc => doc.data() as TripAssignment);
          const vehiclesList = vehiclesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as VehicleMaster);
          const movementsList = movementsSnap.docs.map(doc => doc.data() as Movement);
          const auditList = auditSnap.docs.map(doc => doc.data() as any);
          const alertsList = alertsSnap.docs.map(doc => doc.data() as any);

          // A. LATE check (when status is RUNNING but now exceeds expectedUnloadingDate/Time)
          for (const trip of tripsList) {
            const vehicle = vehiclesList.find(v => v.vehicleNumber === trip.vehicleNumber);
            if (vehicle && vehicle.statusFlag === 'RUNNING') {
              const mv = movementsList.find(m => m.tripId === trip.id);
              if (mv && mv.expectedArrivalDate) {
                const expectedStr = `${mv.expectedArrivalDate}T${mv.expectedArrivalTime || '18:00'}`;
                const expectedTime = new Date(expectedStr);
                if (now.getTime() > expectedTime.getTime()) {
                  // Update status to LATE
                  const vQuery = query(collection(db, 'vehicles'), where('vehicleNumber', '==', trip.vehicleNumber.trim().toUpperCase()));
                  const vSnapshot = await getDocs(vQuery);
                  if (!vSnapshot.empty) {
                    const vDoc = vSnapshot.docs[0];
                    await updateDoc(doc(db, 'vehicles', vDoc.id), { statusFlag: 'LATE' });
                  }

                  const auditId = `audit_late_${Date.now()}`;
                  await setDoc(doc(db, 'vehicleStatusAudit', auditId), {
                    id: auditId,
                    vehicleNumber: trip.vehicleNumber.trim().toUpperCase(),
                    tripId: trip.id,
                    newStatus: 'LATE',
                    timestamp: new Date().toISOString(),
                    remarks: `Trip exceeded Expected Arrival Time (${expectedStr}). Flags updated to LATE automatically.`,
                    recordedBy: 'Auto-Transit Monitor Engine'
                  });

                  // Generate Operations Notification
                  const alertExists = alertsList.some(a => a.tripId === trip.id && a.type === 'delay' && a.title.includes('LATE'));
                  if (!alertExists) {
                    await addDoc(collection(db, 'notifications'), {
                      notificationId: `late_notif_${trip.id}`,
                      tripId: trip.id,
                      type: 'delay',
                      title: `⚠️ LATE: Vehicle ${trip.vehicleNumber} is Overdue!`,
                      message: `Vehicle ${trip.vehicleNumber} on Route ${trip.loadingPoint} ➔ ${trip.unloadingPoint} was expected by ${mv.expectedArrivalDate} ${mv.expectedArrivalTime} and is now LATE.`,
                      timestamp: new Date().toISOString(),
                      vehicleNumber: trip.vehicleNumber,
                      driverName: trip.driverName,
                      isRead: false
                    });
                  }
                }
              }
            }
          }

          // B. AUTO RESET check (UNLOADING DONE resets to LOADING FIND after 15 min)
          for (const vehicle of vehiclesList) {
            if (vehicle.statusFlag === 'UNLOADING DONE') {
              const lastAudit = auditList
                .filter(a => a.vehicleNumber === vehicle.vehicleNumber && a.newStatus === 'UNLOADING DONE')
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
              
              if (lastAudit && lastAudit.timestamp) {
                const auditTime = new Date(lastAudit.timestamp);
                const diffMs = now.getTime() - auditTime.getTime();
                if (diffMs > 15 * 60 * 1000) { // 15 minutes limit
                  const vQuery = query(collection(db, 'vehicles'), where('vehicleNumber', '==', vehicle.vehicleNumber.trim().toUpperCase()));
                  const vSnapshot = await getDocs(vQuery);
                  if (!vSnapshot.empty) {
                    const vDoc = vSnapshot.docs[0];
                    await updateDoc(doc(db, 'vehicles', vDoc.id), { statusFlag: 'LOADING FIND' });
                  }

                  const auditId = `audit_reset_${Date.now()}`;
                  await setDoc(doc(db, 'vehicleStatusAudit', auditId), {
                    id: auditId,
                    vehicleNumber: vehicle.vehicleNumber.trim().toUpperCase(),
                    tripId: lastAudit.tripId || '',
                    newStatus: 'LOADING FIND',
                    timestamp: new Date().toISOString(),
                    remarks: 'Auto Reset: 15 minutes elapsed since Unloading Done. Vehicle is now empty and available.',
                    recordedBy: 'Auto-Transit Monitor Engine'
                  });
                }
              }
            }
          }
        } catch (err) {
          console.error("Auto transition engine execution failure:", err);
        }
      }, 15000); // Trigger check loop every 15 seconds

      return () => {
        unsubDrivers();
        unsubVehicles();
        unsubTrips();
        unsubTickets();
        unsubPods();
        unsubAlerts();
        unsubLoadingConfirmations();
        unsubConsignments();
        try { unsubPartiesLegacy(); } catch (e) {}
        try { unsubParties(); } catch (e) {}
        try { unsubRoutesLegacy(); } catch (e) {}
        try { unsubRoutesNew(); } catch (e) {}
        unsubMovements();
        unsubAudits();
        unsubStaffUsers();
        clearInterval(intervalId);
      };
    };

    return checkAndSync();
  }, []);

  // SEED TEST DATA
  const handleSeedDemoData = async () => {
    const confirmSeed = window.confirm("💡 क्या आप सैंपल ट्रायल/डेमो डाटा सिंक करना चाहते हैं? (Would you like to seed sample fleet assets & trips?)");
    if (!confirmSeed) return;

    setLoading(true);
    try {
      // 1. Core Users Seed
      const sampleUsers = [
        { uid: "dr_uid_9999900001", name: "Ramesh Singh (चालक)", mobile: "9999900001", role: "driver", status: "active", createdAt: new Date().toISOString() },
        { uid: "dr_uid_9999900002", name: "Suresh Yadav (चालक)", mobile: "9999900002", role: "driver", status: "active", createdAt: new Date().toISOString() }
      ];
      for (const u of sampleUsers) {
        await setDoc(doc(db, 'users', u.uid), u);
      }

      // 2. Drivers Master Doc Seed
      const sampleDrivers: DriverMaster[] = [
        {
          id: "dr_uid_9999900001",
          driverCode: "DR-3829",
          name: "Ramesh Singh",
          mobile: "9999900001",
          alternateMobile: "9823101232",
          address: "Sector 15, Noida, UP",
          aadhaarNumber: "1234-5678-9012",
          panNumber: "ABCDE1234F",
          drivingLicenceNumber: "DL-01202409832",
          licenceExpiryDate: "2027-11-20",
          joiningDate: "2025-01-10",
          driverStatus: "available",
          loginOtp: "1234",
          otpActive: true,
          createdAt: new Date().toISOString()
        },
        {
          id: "dr_uid_9999900002",
          driverCode: "DR-5034",
          name: "Suresh Yadav",
          mobile: "9999900002",
          alternateMobile: "8765432098",
          address: "Okhla Phase 3, New Delhi",
          aadhaarNumber: "7766-8899-0012",
          panNumber: "XYZPQ9876C",
          drivingLicenceNumber: "DL-14202300091",
          licenceExpiryDate: "2026-08-15", // Expirying soon
          joiningDate: "2024-05-15",
          driverStatus: "on_trip",
          loginOtp: "1234",
          otpActive: true,
          createdAt: new Date().toISOString()
        }
      ];

      for (const d of sampleDrivers) {
        await setDoc(doc(db, 'drivers', d.id), d);
      }

      // 3. Vehicles Master Doc Seed
      const sampleVehicles: VehicleMaster[] = [
        {
          id: "veh_1",
          vehicleNumber: "HR-55-A-1234",
          vehicleType: "HCV Multi-axle Heavy Truck",
          ownershipType: "owned",
          ownerName: "DNK Logistics Group",
          ownerMobile: "1800100200",
          chassisNumber: "MHAW382302482348348",
          engineNumber: "ENG90838423423",
          capacity: "24 Tons",
          rcExpiry: "2029-12-31",
          insuranceExpiry: "2026-06-05", // Expiry soon!
          fitnessExpiry: "2026-09-12",
          permitExpiry: "2027-04-10",
          pucExpiry: "2026-06-15", // Expiry soon!
          createdAt: new Date().toISOString()
        },
        {
          id: "veh_2",
          vehicleNumber: "UP-16-T-9876",
          vehicleType: "Open-Body Tipper Dump Crane",
          ownershipType: "attached",
          ownerName: "Sher Singh Transport",
          ownerMobile: "9812345678",
          chassisNumber: "MHAW992200223344112",
          engineNumber: "ENG882200",
          capacity: "16 Tons",
          rcExpiry: "2027-01-01",
          insuranceExpiry: "2026-11-20",
          fitnessExpiry: "2026-07-20",
          permitExpiry: "2026-12-05",
          pucExpiry: "2026-08-30",
          createdAt: new Date().toISOString()
        }
      ];

      for (const v of sampleVehicles) {
        await setDoc(doc(db, 'vehicles', v.id), v);
      }

      // 4. Seeding active demo trip
      const sampleTrip: TripAssignment = {
        id: "trip_1001",
        vehicleNumber: "HR-55-A-1234",
        driverId: "dr_uid_9999900002",
        driverName: "Suresh Yadav",
        loadingPoint: "Noida Sector 63 Logistics Hub",
        unloadingPoint: "Sanjay Gandhi Transport Nagar Jaipur",
        status: "running",
        assignedDate: new Date(Date.now() - 3600000 * 2).toISOString(), // 2 hrs ago
        eta: "18 Hours",
        currentLat: 27.2120, // Between Noida and Jaipur
        currentLng: 76.1030,
        lastLocationTime: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'tripAssignments', sampleTrip.id), sampleTrip);

      // 5. Seeding critical alert log notifications
      const sampleNotifications = [
        {
          type: "delay",
          title: "⚠️ Trip Delay Alert!",
          message: "Driver Suresh Yadav reported delay [TRAFFIC] for vehicle HR-55-A-1234. Description: Jam near Manesar toll Plaza",
          timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15m ago
          vehicleNumber: "HR-55-A-1234",
          driverName: "Suresh Yadav",
          location: { latitude: 28.3512, longitude: 76.9204 },
          isRead: false
        }
      ];
      for (const sn of sampleNotifications) {
        await addDoc(collection(db, 'notifications'), sn);
      }

      alert("🎉 सैंपल डेमो डाटा सफलतापूर्वक लोड किया गया! (Sample testing data synchronized successfully!)");
    } catch (err) {
      console.error("Data seeds failed", err);
    } finally {
      setLoading(false);
    }
  };

  // CREATE NEW DRIVER PROFILE
  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    const mobile = newDriver.mobile.trim();
    if (!newDriver.name || !mobile) {
      alert("Name and mobile are mandatory");
      return;
    }
    if (!newDriver.loginOtp.trim()) {
      alert("Driver Login OTP is mandatory");
      return;
    }

    try {
      const driverId = "dr_uid_" + mobile;
      const driverCode = "DR-" + Math.floor(1000 + Math.random() * 9000);
      const linkedVehicleId = newDriver.linkedVehicleId || '';
      const linkedVehicleNumber = linkedVehicleId
        ? vehicles.find(v => v.id === linkedVehicleId)?.vehicleNumber || ''
        : '';

      // Create Driver Master Entry
      const driverObj: DriverMaster = {
        id: driverId,
        driverCode,
        name: newDriver.name || '',
        mobile,
        alternateMobile: newDriver.alternateMobile || '',
        address: newDriver.address || '',
        aadhaarNumber: newDriver.aadhaarNumber || '',
        panNumber: newDriver.panNumber || '',
        drivingLicenceNumber: newDriver.drivingLicenceNumber || '',
        licenceExpiryDate: newDriver.licenceExpiryDate || '',
        joiningDate: newDriver.joiningDate || new Date().toISOString().split('T')[0],
        driverStatus: 'available',
        linkedVehicleId,
        linkedVehicleNumber,
        loginOtp: newDriver.loginOtp || '',
        otpActive: newDriver.otpActive ?? true,
        createdAt: new Date().toISOString(),
        recordStatus: 'Active'
      };

      await setDoc(doc(db, 'drivers', driverId), driverObj);

      // Link in the matched vehicle
      if (newDriver.linkedVehicleId) {
        await updateDoc(doc(db, 'vehicles', newDriver.linkedVehicleId), {
          linkedDriverId: driverId,
          linkedDriverName: newDriver.name
        });
        // Clear links from any other drivers previously targeting this vehicle
        const otherDrivers = drivers.filter(d => d.linkedVehicleId === newDriver.linkedVehicleId);
        for (const d of otherDrivers) {
          await updateDoc(doc(db, 'drivers', d.id), {
            linkedVehicleId: '',
            linkedVehicleNumber: ''
          });
        }
      }

      // Reg as User doc so driver can log in
      await setDoc(doc(db, 'users', driverId), {
        uid: driverId,
        name: newDriver.name || '',
        mobile,
        role: 'driver',
        status: 'active',
        createdAt: new Date().toISOString()
      });

      setShowAddDriver(false);
      setNewDriver({
        name: '', mobile: '', alternateMobile: '', address: '',
        aadhaarNumber: '', panNumber: '', drivingLicenceNumber: '', licenceExpiryDate: '', joiningDate: new Date().toISOString().split('T')[0],
        linkedVehicleId: '', loginOtp: '', otpActive: true
      });
      alert(`🎉 Driver ${newDriver.name} added! Driver Code: ${driverCode}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'drivers');
    }
  };

  // EDIT AN EXISTING DRIVER PROFILE
  const handleEditDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDriver) return;
    if (!editingDriver.name) {
      alert("Driver Name is mandatory");
      return;
    }
    const newMobile = (editingDriver.mobile || '').trim();
    if (!newMobile) {
      alert("Driver mobile is mandatory");
      return;
    }
    if (!(editingDriver.loginOtp || '').trim()) {
      alert("Driver Login OTP is mandatory");
      return;
    }

    try {
      const oldDriverId = editingDriver.id;
      const newDriverId = "dr_uid_" + newMobile;
      const mobileChanged = oldDriverId !== newDriverId;
      const previousDriver = drivers.find(d => d.id === oldDriverId);
      const previousLinkedVehicleId = previousDriver?.linkedVehicleId || '';
      const newLinkedVehicleId = editingDriver.linkedVehicleId || '';
      const newVehObj = newLinkedVehicleId ? vehicles.find(v => v.id === newLinkedVehicleId) : null;
      const recordStatus = (editingDriver as any).recordStatus || 'Active';

      const updatedDriver: DriverMaster = {
        id: newDriverId,
        driverCode: editingDriver.driverCode || previousDriver?.driverCode || '',
        name: editingDriver.name || '',
        mobile: newMobile,
        alternateMobile: editingDriver.alternateMobile || '',
        address: editingDriver.address || '',
        aadhaarNumber: editingDriver.aadhaarNumber || '',
        panNumber: editingDriver.panNumber || '',
        drivingLicenceNumber: editingDriver.drivingLicenceNumber || '',
        licenceExpiryDate: editingDriver.licenceExpiryDate || '',
        joiningDate: editingDriver.joiningDate || previousDriver?.joiningDate || '',
        driverStatus: editingDriver.driverStatus || 'available',
        aadhaarDocUrl: editingDriver.aadhaarDocUrl || '',
        panDocUrl: editingDriver.panDocUrl || '',
        licenceDocUrl: editingDriver.licenceDocUrl || '',
        linkedVehicleId: newLinkedVehicleId,
        linkedVehicleNumber: newVehObj ? newVehObj.vehicleNumber : '',
        loginOtp: editingDriver.loginOtp || '',
        otpActive: editingDriver.otpActive ?? true,
        createdAt: editingDriver.createdAt || previousDriver?.createdAt || new Date().toISOString(),
        recordStatus
      };

      // Update Driver Profile
      await setDoc(doc(db, 'drivers', newDriverId), updatedDriver);

      // Handle custom link changes
      if (previousLinkedVehicleId !== newLinkedVehicleId) {
        if (previousLinkedVehicleId) {
          await updateDoc(doc(db, 'vehicles', previousLinkedVehicleId), {
            linkedDriverId: '',
            linkedDriverName: ''
          });
        }
        if (newLinkedVehicleId) {
          await updateDoc(doc(db, 'vehicles', newLinkedVehicleId), {
            linkedDriverId: newDriverId,
            linkedDriverName: editingDriver.name
          });
          // Clear any other drivers originally pointing to this vehicle (to preserve 1:1)
          const otherDrivers = drivers.filter(d => d.linkedVehicleId === newLinkedVehicleId && d.id !== oldDriverId && d.id !== newDriverId);
          for (const d of otherDrivers) {
            await updateDoc(doc(db, 'drivers', d.id), {
              linkedVehicleId: '',
              linkedVehicleNumber: ''
            });
          }
        }
      } else if (newLinkedVehicleId) {
        // Enforce updated driver name in vehicle link reference
        await updateDoc(doc(db, 'vehicles', newLinkedVehicleId), {
          linkedDriverId: newDriverId,
          linkedDriverName: editingDriver.name
        });
      }

      // Update the name and status entry in 'users' so login and trip references show updated names
      await setDoc(doc(db, 'users', newDriverId), {
        uid: newDriverId,
        name: editingDriver.name || '',
        mobile: newMobile,
        role: 'driver',
        status: mobileChanged ? 'active' : (editingDriver.driverStatus === 'inactive' ? 'inactive' : 'active'),
        createdAt: editingDriver.createdAt || new Date().toISOString()
      }, { merge: true });

      if (mobileChanged) {
        await deleteDoc(doc(db, 'drivers', oldDriverId));
        await deleteDoc(doc(db, 'users', oldDriverId));
      }

      setShowEditDriver(false);
      setEditingDriver(null);
      alert(`🎉 Driver ${editingDriver.name} details successfully updated!`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'drivers');
    }
  };

  // EDIT AN EXISTING VEHICLE PROFILE
  const handleEditVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVehicle) return;
    if (isViewOnlyVehicle) return;

    try {
      const previousLinkedDriverId = vehicles.find(v => v.id === editingVehicle.id)?.linkedDriverId;
      const newLinkedDriverId = editingVehicle.linkedDriverId || '';
      const newDrvObj = newLinkedDriverId ? drivers.find(d => d.id === newLinkedDriverId) : null;

      const updatedVehicle: VehicleMaster = {
        ...editingVehicle,
        linkedDriverId: newLinkedDriverId,
        linkedDriverName: newDrvObj ? newDrvObj.name : '',
        recordStatus: (editingVehicle as any).recordStatus || 'Active'
      };

      await setDoc(doc(db, 'vehicles', editingVehicle.id), updatedVehicle);

      if (previousLinkedDriverId !== newLinkedDriverId) {
        if (previousLinkedDriverId) {
          await updateDoc(doc(db, 'drivers', previousLinkedDriverId), {
            linkedVehicleId: '',
            linkedVehicleNumber: ''
          });
        }
        if (newLinkedDriverId) {
          await updateDoc(doc(db, 'drivers', newLinkedDriverId), {
            linkedVehicleId: editingVehicle.id,
            linkedVehicleNumber: editingVehicle.vehicleNumber
          });
          // Clear any other vehicles pointing to this driver (to preserve 1:1)
          const otherVehicles = vehicles.filter(v => v.linkedDriverId === newLinkedDriverId && v.id !== editingVehicle.id);
          for (const v of otherVehicles) {
            await updateDoc(doc(db, 'vehicles', v.id), {
              linkedDriverId: '',
              linkedDriverName: ''
            });
          }
        }
      }

      setShowEditVehicle(false);
      setEditingVehicle(null);
      alert(`🎉 Vehicle ${editingVehicle.vehicleNumber} registry updated!`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'vehicles');
    }
  };

  // CREATE NEW VEHICLE RECORD
  const handleCreateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVehicle.vehicleNumber || !newVehicle.vehicleType) {
      alert("Vehicle Number & Type are required");
      return;
    }

    try {
      const vehicleId = "veh_" + newVehicle.vehicleNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const linkedDrvObj = newVehicle.linkedDriverId ? drivers.find(d => d.id === newVehicle.linkedDriverId) : null;

      const payload: VehicleMaster = {
        id: vehicleId,
        ...newVehicle,
        linkedDriverId: newVehicle.linkedDriverId || '',
        linkedDriverName: linkedDrvObj ? linkedDrvObj.name : '',
        createdAt: new Date().toISOString(),
        recordStatus: 'Active'
      };

      await setDoc(doc(db, 'vehicles', vehicleId), payload);

      if (newVehicle.linkedDriverId) {
        // Link the driver to this vehicle
        await updateDoc(doc(db, 'drivers', newVehicle.linkedDriverId), {
          linkedVehicleId: vehicleId,
          linkedVehicleNumber: newVehicle.vehicleNumber
        });
        // Clear links from other vehicles pointing to this driver
        const otherVehicles = vehicles.filter(v => v.linkedDriverId === newVehicle.linkedDriverId);
        for (const v of otherVehicles) {
          await updateDoc(doc(db, 'vehicles', v.id), {
            linkedDriverId: '',
            linkedDriverName: ''
          });
        }
      }

      setShowAddVehicle(false);
      setNewVehicle({
        vehicleNumber: '', vehicleType: 'HCV Multi-axle Heavy Truck', ownershipType: 'owned',
        ownerName: '', ownerMobile: '', chassisNumber: '', engineNumber: '', capacity: '24 Tons',
        rcExpiry: '', insuranceExpiry: '', fitnessExpiry: '', permitExpiry: '', pucExpiry: '',
        linkedDriverId: ''
      });
      alert(`🎉 Vehicle ${newVehicle.vehicleNumber} successfully added!`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'vehicles');
    }
  };

  // Driver / Vehicle list actions: view, open edit modal, activate, deactivate
  const handleViewDriver = (d: DriverMaster) => {
    setEditingDriver({
      ...d,
      linkedVehicleId: d.linkedVehicleId || '',
      linkedVehicleNumber: d.linkedVehicleNumber || '',
      loginOtp: d.loginOtp || '',
      otpActive: d.otpActive ?? true
    });
    setIsViewOnlyDriver(true);
    setShowEditDriver(true);
  };

  const openEditDriverFromList = (d: DriverMaster) => {
    setEditingDriver({
      ...d,
      linkedVehicleId: d.linkedVehicleId || '',
      linkedVehicleNumber: d.linkedVehicleNumber || '',
      loginOtp: d.loginOtp || '',
      otpActive: d.otpActive ?? true
    });
    setIsViewOnlyDriver(false);
    setShowEditDriver(true);
  };

  const handleActivateDriver = async (id: string) => {
    try {
      await updateDoc(doc(db, 'drivers', id), {
        recordStatus: 'Active',
        driverStatus: 'available',
        otpActive: true
      });
      showToast('Driver activated', 'success');
    } catch (e) {
      showToast('Failed to activate driver', 'error');
    }
  };

  const handleDeactivateDriver = async (id: string) => {
    try {
      await updateDoc(doc(db, 'drivers', id), {
        recordStatus: 'Inactive',
        driverStatus: 'inactive',
        otpActive: false
      });
      showToast('Driver deactivated', 'info');
    } catch (e) {
      showToast('Failed to deactivate driver', 'error');
    }
  };

  const getDriverRecordStatus = (driver: DriverMaster) => {
    if (driver.recordStatus === 'Active') return 'Active';
    if (driver.recordStatus === 'Inactive' || driver.driverStatus === 'inactive') return 'Inactive';
    return 'Active';
  };

  const handleViewVehicle = (v: VehicleMaster) => {
    setEditingVehicle(v);
    setIsViewOnlyVehicle(true);
    setShowEditVehicle(true);
  };

  const openEditVehicleFromList = (v: VehicleMaster) => {
    setEditingVehicle(v);
    setIsViewOnlyVehicle(false);
    setShowEditVehicle(true);
  };

  const handleActivateVehicle = async (id: string) => {
    try {
      await updateDoc(doc(db, 'vehicles', id), { recordStatus: 'Active' });
      showToast('Vehicle activated', 'success');
    } catch (e) {
      showToast('Failed to activate vehicle', 'error');
    }
  };

  const handleDeactivateVehicle = async (id: string) => {
    try {
      await updateDoc(doc(db, 'vehicles', id), { recordStatus: 'Inactive' });
      showToast('Vehicle deactivated', 'info');
    } catch (e) {
      showToast('Failed to deactivate vehicle', 'error');
    }
  };

  const savePartyToMaster = async (partyName: string, partyMobile?: string) => {
    if (!partyName || partyName.trim() === '') return;
    const nameNorm = partyName.trim();
    const exists = partyMasters.some(p => p.partyName.toLowerCase() === nameNorm.toLowerCase());
    if (!exists) {
      const docId = 'party_' + Math.floor(100000 + Math.random() * 900000);
      try {
        await setDoc(doc(db, 'partyMaster', docId), {
          id: docId,
          partyName: nameNorm,
          partyMobile: partyMobile || '',
          createdAt: new Date().toISOString()
        });
      } catch (e) {
        console.error("Autosave Party failed", e);
      }
    }
  };

  const saveRouteToMaster = async (loadingPoint: string, unloadingPoint: string) => {
    if (!loadingPoint || !unloadingPoint) return;
    const lNorm = loadingPoint.trim();
    const uNorm = unloadingPoint.trim();
    if (lNorm === '' || uNorm === '') return;
    const routeName = `${lNorm} to ${uNorm}`;
    const exists = routeMasters.some(r => r.routeName.toLowerCase() === routeName.toLowerCase());
    if (!exists) {
      try {
        const routeCode = await generateRouteCode();
        const createdAt = new Date().toISOString();
        // Write to new `routes` collection (id = routeCode)
        await setDoc(doc(db, 'routes', routeCode), {
          id: routeCode,
          routeCode,
          routeName,
          fromCity: lNorm,
          toCity: uNorm,
          viaRoute: '',
          distanceKm: 0,
          transitHours: 0,
          active: true,
          createdAt
        });

        // Also keep legacy collection in sync
        const docId = 'route_' + Math.floor(100000 + Math.random() * 900000);
        await setDoc(doc(db, 'routeMaster', docId), {
          id: docId,
          routeCode,
          routeName: routeName,
          loadingPoint: lNorm,
          unloadingPoint: uNorm,
          createdAt
        });
      } catch (e) {
        console.error("Autosave Route failed", e);
      }
    }
  };

  const [manualPartyName, setManualPartyName] = useState('');
  const [manualPartyMobile, setManualPartyMobile] = useState('');
  const [manualPartyType, setManualPartyType] = useState<'CLIENT' | 'BROKER'>('CLIENT');
  const [manualPartyPlace, setManualPartyPlace] = useState('');
  const [manualPartyState, setManualPartyState] = useState('');
  const [manualLoadingPoint, setManualLoadingPoint] = useState('');
  const [manualUnloadingPoint, setManualUnloadingPoint] = useState('');

  const handleManualAddParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPartyName.trim() || !manualPartyPlace.trim()) return;
    const nameNorm = manualPartyName.trim();
    const docId = 'party_' + Math.floor(100000 + Math.random() * 900000);
    try {
      await setDoc(doc(db, 'partyMaster', docId), {
        id: docId,
        partyName: nameNorm,
        partyType: manualPartyType,
        placeCity: manualPartyPlace.trim(),
        state: manualPartyState.trim() || '',
        partyMobile: manualPartyMobile.trim() || '',
        createdAt: new Date().toISOString()
      });
      setManualPartyName('');
      setManualPartyMobile('');
      setManualPartyType('CLIENT');
      setManualPartyPlace('');
      setManualPartyState('');
      alert("🎉 Party successfully added to Master Registry!");
    } catch (e) {
      console.error(e);
    }
  };

  const handleManualAddRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualLoadingPoint.trim() || !manualUnloadingPoint.trim()) return;
    const lNorm = manualLoadingPoint.trim();
    const uNorm = manualUnloadingPoint.trim();
    const routeName = `${lNorm} to ${uNorm}`;
    try {
      const routeCode = await generateRouteCode();
      const createdAt = new Date().toISOString();
      // New routes collection
      await setDoc(doc(db, 'routes', routeCode), {
        id: routeCode,
        routeCode,
        routeName,
        fromCity: lNorm,
        toCity: uNorm,
        viaRoute: '',
        distanceKm: 0,
        transitHours: 0,
        active: true,
        createdAt
      });

      // Legacy collection mirror
      const docId = 'route_' + Math.floor(100000 + Math.random() * 900000);
      await setDoc(doc(db, 'routeMaster', docId), {
        id: docId,
        routeCode,
        routeName,
        loadingPoint: lNorm,
        unloadingPoint: uNorm,
        createdAt
      });

      setManualLoadingPoint('');
      setManualUnloadingPoint('');
      alert("🎉 Route successfully added to Master Registry!");
    } catch (e) {
      console.error(e);
    }
  };

  // ASSIGN A NEW TRIP
  const handleAssignTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    const { vehicleNumber, driverId, loadingPoint, unloadingPoint, eta } = newTrip;

    if (!vehicleNumber || !driverId || !loadingPoint || !unloadingPoint) {
      alert("Please fill all assignment criteria");
      return;
    }
    const selectedVehicle = vehicles.find(v => v.vehicleNumber === vehicleNumber);
    if (!isVehicleActive(selectedVehicle)) {
      alert("Inactive vehicle cannot be assigned to a trip");
      return;
    }

    try {
      const tripId = "trip_" + Math.floor(10000 + Math.random() * 90000);
      const matchedDriver = drivers.find(d => d.id === driverId);

      // Autosave Route in master database
      await saveRouteToMaster(loadingPoint, unloadingPoint);

      const payload: TripAssignment = {
        id: tripId,
        vehicleNumber,
        driverId,
        driverName: matchedDriver ? matchedDriver.name : "Unmapped-Driver",
        loadingPoint,
        unloadingPoint,
        status: 'assigned',
        assignedDate: new Date().toISOString(),
        eta
      };

      await setDoc(doc(db, 'tripAssignments', tripId), payload);

      // Lock Driver status
      if (driverId) {
        await updateDoc(doc(db, 'drivers', driverId), { driverStatus: 'on_trip' });
      }

      // Dispatch alert notification
      await addDoc(collection(db, 'notifications'), {
        type: 'info',
        title: '🚛 New Trip Dispatched!',
        message: `Fleet Admin scheduled trip ${tripId} for vehicle ${vehicleNumber} to move from ${loadingPoint} to ${unloadingPoint}. Driver: ${matchedDriver?.name || 'Unassigned'}`,
        timestamp: new Date().toISOString(),
        vehicleNumber,
        driverName: matchedDriver?.name || 'Unassigned',
        isRead: false
      });

      setShowAssignTrip(false);
      setNewTrip({ vehicleNumber: '', driverId: '', loadingPoint: '', unloadingPoint: '', eta: '24 Hours' });
      alert(`🚛 Trip Assignment ${tripId} successfully dispatched!`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tripAssignments');
    }
  };

  // ==================== LOADING CONFIRMATION CRUD ====================
  const getLoadingFindVehicles = () => vehicles.filter(v => isVehicleActive(v) && v.statusFlag === 'LOADING FIND');

  const getVehicleSuggestions = (query: string) => {
    const q = (query || '').trim().toUpperCase();
    if (!q) return [] as VehicleMaster[];
    return vehicles.filter(v => isVehicleActive(v) && v.vehicleNumber.includes(q));
  };

  const normalizeStatus = (status?: string | null) => {
    if (!status) return '';
    let s = String(status).toUpperCase();
    // replace underscores/dashes with spaces, collapse spaces
    s = s.replace(/[_-]/g, ' ').trim().replace(/\s+/g, ' ');

    // map common variants to canonical forms
    if (s.includes('LOADING FIND') || s.includes('LOADINGFIND')) return 'LOADING FIND';
    if (s.includes('LOADINGCONFIRM') || s.includes('LOADING CONFIRM') || s.includes('LOADINGCONFIRM')) return 'LOADING CONFIRM';
    if (s.includes('LOADING DONE') || s.includes('LOADINGDONE')) return 'LOADING DONE';
    if (s.includes('MOVEMENT PENDING') || s.includes('MOVEMENTPENDING')) return 'MOVEMENT PENDING';
    if (s.includes('RUNNING')) return 'RUNNING';
    if (s.includes('LATE')) return 'LATE';
    if (s.includes('UNLOADING REPORT') || s.includes('UNLOADINGREPORTING')) return 'UNLOADING REPORTING';
    if (s.includes('UNLOADING DONE') || s.includes('UNLOADINGDONE')) return 'UNLOADING DONE';
    if (s.includes('MAINT')) return 'MAINTENANCE';
    if (s.includes('WITHOUT') && s.includes('DRIVER')) return 'WITHOUT DRIVER';
    if (s.includes('WITHOUTDRIVER')) return 'WITHOUT DRIVER';

    return s;
  };

  const getNextLoadingConfirmationNo = () => {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const prefix = `LC-${today}-`;
    const nextNumber = loadingConfirmations
      .map(item => item.loadingNo || item.id)
      .filter((no): no is string => Boolean(no?.startsWith(prefix)))
      .reduce((max, no) => {
        const suffix = Number(no.slice(prefix.length));
        return Number.isFinite(suffix) ? Math.max(max, suffix) : max;
      }, 0) + 1;

    return `${prefix}${String(nextNumber).padStart(4, '0')}`;
  };

  const handleLoadingVehicleSelect = (vehicleNumber: string) => {
    const selectedVehicle = vehicles.find(v => v.vehicleNumber === vehicleNumber);
    if (!isVehicleActive(selectedVehicle)) {
      setVehicleNotAvailable('Inactive vehicle cannot be selected for Loading Confirmation');
      return;
    }
    const linkedDriver = selectedVehicle?.linkedDriverId
      ? drivers.find(d => d.id === selectedVehicle.linkedDriverId)
      : drivers.find(d => d.linkedVehicleNumber === selectedVehicle?.vehicleNumber);

    setNewLoading(prev => ({
      ...prev,
      tripId: '',
      vehicleNo: vehicleNumber,
      vehicleType: selectedVehicle?.vehicleType || '',
      driverName: selectedVehicle?.linkedDriverName || linkedDriver?.name || '',
      driverMobile: linkedDriver?.mobile || ''
    }));
  };

  const handleSelectVehicleSuggestion = (v: VehicleMaster) => {
    console.log('Suggestion clicked', v);
    setSelectedLoadingVehicle(v);
    handleLoadingVehicleSelect(v.vehicleNumber);
    setVehicleNotAvailable(null);
    setVehicleSearch(v.vehicleNumber);
    setHighlightedSuggestionIndex(-1);
    setShowVehicleSuggestions(false);
  };

  const handleSelectLoadingParty = (party: PartyMaster) => {
  const placeCity =
    party.placeCity ||
    (party as any).city ||
    (party as any).place ||
    (party as any).partyPlaceCity ||
    '';

  const mobile =
    party.mobileNumber ||
    party.partyMobile ||
    (party as any).mobile ||
    '';

  setSelectedLoadingParty(party);

  setNewLoading(prev => ({
    ...prev,
    loadingParty: party.partyName || '',
    partyVendorInfo: party.partyName || '',
    loadingContactPerson: party.contactPerson || '',
    loadingMobile: mobile,
    loadingAddress: placeCity || prev.loadingAddress,
    partyType: party.partyType === 'BROKER' ? 'BROKER' : 'CLIENT',
    partyPlaceCity: placeCity
  }));

  setShowPartySuggestions(false);
  setHighlightedPartySuggestionIndex(-1);
};

  const handleSelectLoadingConfirmationForConsignment = (loadingConfirmationId: string) => {
    const selectedLoading = loadingConfirmations.find(lc => lc.id === loadingConfirmationId);

    if (!selectedLoading) {
      setNewConsignment(prev => ({
        ...prev,
        loadingConfirmationId,
        tripId: '',
        vehicleNumber: '',
        driverName: '',
        consignorName: '',
        consignorMobile: '',
        billingParty: '',
        routeDetails: ''
      }));
      return;
    }

    const partyName = selectedLoading.loadingParty || selectedLoading.partyVendorInfo || '';
    const mobile = selectedLoading.loadingMobile || '';

    setNewConsignment(prev => ({
      ...prev,
      loadingConfirmationId: selectedLoading.id,
      tripId: selectedLoading.tripId || prev.tripId,
      vehicleNumber: selectedLoading.vehicleNo || '',
      driverName: selectedLoading.driverName || '',
      consignorName: partyName,
      consignorMobile: mobile,
      billingParty: partyName || prev.billingParty,
      routeDetails: selectedLoading.routeDetails || ''
    }));
  };

  const handleCreateLoading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLoading.vehicleNo) {
      alert("Please select vehicle number first");
      return;
    }
    if (!newLoading.routeDetails.trim()) {
      alert("Please select or enter Route Details");
      return;
    }
    if (!newLoading.loadingParty.trim() || !newLoading.loadingAddress.trim() || !newLoading.loadingDate || !newLoading.loadingTime || !newLoading.googleMapLocation.trim()) {
      alert("Please fill loading party, address, date/time, and Google Map location");
      return;
    }

    try {
      const selectedVehicle = vehicles.find(v => v.vehicleNumber === newLoading.vehicleNo);
      const rawStatus = selectedVehicle?.statusFlag || '';
      const derivedStatus = selectedVehicle ? getVehicleDisplayStatus(selectedVehicle) : '';
      const driverAssigned = Boolean(selectedVehicle?.linkedDriverId || selectedVehicle?.linkedDriverName);
      const activeTripFound = selectedVehicle ? trips.some(t => normalizeVehicleNumber(t.vehicleNumber) === normalizeVehicleNumber(selectedVehicle.vehicleNumber) && t.status !== 'completed') : false;
      console.log('Loading Confirmation Vehicle Validation', {
        vehicleNumber: selectedVehicle?.vehicleNumber,
        rawStatus,
        derivedStatus,
        driverAssigned,
        activeTripFound
      });

      if (!selectedVehicle || !isVehicleActive(selectedVehicle) || !(derivedStatus === 'LOADING FIND' || derivedStatus === 'WITHOUT DRIVER')) {
        alert("Please select a vehicle with LOADING FIND or WITHOUT DRIVER status");
        return;
      }

      const linkedDriver = selectedVehicle.linkedDriverId
        ? drivers.find(d => d.id === selectedVehicle.linkedDriverId)
        : drivers.find(d => d.linkedVehicleNumber === selectedVehicle.vehicleNumber);
      const vehicleNumber = selectedVehicle.vehicleNumber;
      const driverName = selectedVehicle.linkedDriverName || linkedDriver?.name || newLoading.driverName || '';
      const driverMobile = linkedDriver?.mobile || newLoading.driverMobile || '';
      
      const confNo = newLoading.loadingNo || getNextLoadingConfirmationNo();
      const confirmationId = confNo;
      
      const payload: LoadingConfirmation = {
        id: confirmationId,
        tripId: newLoading.tripId || '',
        loadingNo: confNo,
        vehicleNo: vehicleNumber,
        vehicleType: selectedVehicle.vehicleType,
        driverName: driverName,
        driverMobile: driverMobile,
        loadingParty: newLoading.loadingParty || newLoading.partyVendorInfo,
        loadingAddress: newLoading.loadingAddress || newLoading.loadingPointLocation,
        loadingContactPerson: newLoading.loadingContactPerson || 'N/A',
        loadingMobile: newLoading.loadingMobile || 'N/A',
        googleMapLocation: newLoading.googleMapLocation || '',
        loadingDate: newLoading.loadingDate || new Date().toISOString().split('T')[0],
        loadingTime: newLoading.loadingTime || new Date().toLocaleTimeString('en-US', { hour12: false }).substring(0, 5),
        remarks: newLoading.remarks || '',
        isLoadingConfirmed: true, // Auto confirm when created by Operations
        status: 'confirmed',
        createdAt: new Date().toISOString(),
        partyType: newLoading.partyType === 'BROKER' ? 'BROKER' : newLoading.partyType === 'CLIENT' ? 'CLIENT' : undefined,
        placeCity: newLoading.partyPlaceCity || undefined,
        
        // Old style fields compat
        loadingPointLocation: newLoading.loadingAddress || newLoading.loadingPointLocation || '-',
        partyVendorInfo: newLoading.loadingParty || newLoading.partyVendorInfo || '-',
        routeDetails: newLoading.routeDetails || '-',
        weightDetails: newLoading.weightDetails || '18 Tons'
      };

      await setDoc(doc(db, 'loadingConfirmations', confirmationId), payload);

      // Transition vehicle flag dynamically to LOADING CONFIRM
      if (vehicleNumber) {
        await logVehicleStatusChange(vehicleNumber, 'LOADING CONFIRM', payload.tripId || confNo, 'Operations created loading confirmation from vehicle selection');
      }

      setShowAddLoading(false);
      setSelectedLoadingVehicle(null);
      setNewLoading({
        tripId: '',
        loadingPointLocation: '',
        partyVendorInfo: '',
        routeDetails: '',
        weightDetails: '',
        isLoadingConfirmed: false,
        status: 'pending',
        loadingNo: '',
        vehicleNo: '',
        vehicleType: '',
        driverName: '',
        driverMobile: '',
        loadingParty: '',
        loadingAddress: '',
        loadingContactPerson: '',
        loadingMobile: '',
        partyType: '',
        partyPlaceCity: '',
        googleMapLocation: '',
        loadingDate: '',
        loadingTime: '',
        remarks: ''
      });
      alert("🎉 Loading Confirmation created/confirmed and Vehicle flag set to LOADING CONFIRM!");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'loadingConfirmations');
    }
  };

  const handleUpdateLoading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLoading) return;
    const loadingParty = (editingLoading.loadingParty || editingLoading.partyVendorInfo || '').trim();
    const loadingAddress = (editingLoading.loadingAddress || editingLoading.loadingPointLocation || '').trim();
    const routeDetails = (editingLoading.routeDetails || '').trim();
    const googleMapLocation = (editingLoading.googleMapLocation || '').trim();
    const loadingDate = (editingLoading.loadingDate || '').trim();
    const loadingTime = (editingLoading.loadingTime || '').trim();

    if (!loadingParty || !loadingAddress || !routeDetails || !googleMapLocation || !loadingDate || !loadingTime) {
      alert("Please fill vehicle loading party, address, route, date/time, and Google Map location");
      return;
    }

    try {
      const isConfirmed = editingLoading.status === 'confirmed';
      const updatedPayload: LoadingConfirmation = {
        ...editingLoading,
        loadingParty,
        loadingAddress,
        googleMapLocation,
        loadingDate,
        loadingTime,
        partyVendorInfo: loadingParty,
        loadingPointLocation: loadingAddress,
        routeDetails,
        weightDetails: editingLoading.weightDetails || '18 Tons',
        isLoadingConfirmed: isConfirmed,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'loadingConfirmations', editingLoading.id), updatedPayload);

      if (isConfirmed && editingLoading.tripId) {
        await updateDoc(doc(db, 'tripAssignments', editingLoading.tripId), { 
          status: 'loaded'
        });
      }

      setShowEditLoading(false);
      setEditingLoading(null);
      alert("🎉 Loading details updated!");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'loadingConfirmations');
    }
  };

  const handleCancelLoading = (id: string) => {
    askConfirmation(
      "Cancel Loading Direction (लोड़िंग रद्द करें)",
      "Are you sure you want to Cancel this loading point direction? (क्या आप वाकई इस लोड़िंग निर्देश को रद्द करना चाहते हैं?)",
      async () => {
        try {
          await updateDoc(doc(db, 'loadingConfirmations', id), {
            status: 'cancelled',
            isLoadingConfirmed: false,
            updatedAt: new Date().toISOString()
          });
          showToast("❌ Loading point direction status set to [CANCELLED]");
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'loadingConfirmations');
        }
      }
    );
  };

  const handleDeleteLoading = (id: string) => {
    askConfirmation(
      "Delete Loading Record (लोड़िंग विवरण मिटाएं)",
      "Are you sure you want to Delete this loading confirmation record permanently? (क्या आप वाकई इस लोड़िंग रिकॉर्ड को हमेशा के लिए मिटाना चाहते हैं?)",
      async () => {
        try {
          await deleteDoc(doc(db, 'loadingConfirmations', id));
          showToast("🗑️ Loading Confirmation Deleted permanently.");
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'loadingConfirmations');
        }
      }
    );
  };

  // ==================== CONSIGNMENT CRUD ====================
  const handleCreateConsignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConsignment.consignorName || !newConsignment.consigneeName || !newConsignment.materialDescription || !newConsignment.weightTons || !newConsignment.freightAmount) {
      alert("Please fill out consignor/consignee names, material description, weight, and freight amount");
      return;
    }

    try {
      const selectedTrip = trips.find(t => t.id === newConsignment.tripId);
      const vehicleNum = newConsignment.vehicleNumber || selectedTrip?.vehicleNumber || '';
      const driverName = newConsignment.driverName || selectedTrip?.driverName || '';

      const consignmentId = newConsignment.lrNumber || "LR-" + Math.floor(100000 + Math.random() * 900000);
      const payload: Consignment = {
        id: consignmentId,
        tripId: newConsignment.tripId,
        loadingConfirmationId: newConsignment.loadingConfirmationId || '',
        lrNumber: consignmentId,
        lrDate: newConsignment.lrDate || new Date().toISOString().split('T')[0],
        consignorName: newConsignment.consignorName,
        consignorMobile: newConsignment.consignorMobile || '',
        consigneeName: newConsignment.consigneeName,
        consigneeMobile: newConsignment.consigneeMobile || '',
        billingParty: newConsignment.billingParty || newConsignment.consignorName,
        vehicleNumber: vehicleNum,
        driverName: driverName,
        routeDetails: newConsignment.routeDetails || '',
        materialDescription: newConsignment.materialDescription,
        quantity: newConsignment.quantity || '1',
        weightTons: newConsignment.weightTons,
        freightAmount: newConsignment.freightAmount,
        advanceAmount: newConsignment.advanceAmount || '0',
        remarks: newConsignment.remarks || '',
        paymentTerms: newConsignment.paymentTerms,
        status: 'active',
        recordStatus: 'Active',
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'consignments', consignmentId), payload);

      // Transition vehicle status flag dynamically to LOADING DONE
      if (vehicleNum) {
        await logVehicleStatusChange(vehicleNum, 'LOADING DONE', newConsignment.tripId, 'Lorry Receipt (LR) generated by operations. Loading completed.');
      }

      // Automatically change trip classification / status to loaded
      if (newConsignment.tripId) {
        await updateDoc(doc(db, 'tripAssignments', newConsignment.tripId), {
          status: 'loaded'
        });
      }

      // Autosave party names to PartyMaster
      if (newConsignment.consignorName) {
        await savePartyToMaster(newConsignment.consignorName, newConsignment.consignorMobile);
      }
      if (newConsignment.consigneeName) {
        await savePartyToMaster(newConsignment.consigneeName, newConsignment.consigneeMobile);
      }
      if (newConsignment.billingParty && newConsignment.billingParty !== newConsignment.consignorName) {
        await savePartyToMaster(newConsignment.billingParty, '');
      }

      setShowAddConsignment(false);
      setNewConsignment({
        tripId: '',
        loadingConfirmationId: '',
        lrNumber: '',
        lrDate: '',
        consignorName: '',
        consignorMobile: '',
        consigneeName: '',
        consigneeMobile: '',
        billingParty: '',
        vehicleNumber: '',
        driverName: '',
        routeDetails: '',
        materialDescription: '',
        quantity: '',
        weightTons: '',
        freightAmount: '',
        advanceAmount: '',
        remarks: '',
        paymentTerms: 'paid'
      });
      alert(`🎉 Consignment LR successfully compiled and recorded! LR No: ${consignmentId}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'consignments');
    }
  };

  // ==================== MOVEMENT DISPATCH OPERATIONS ====================
  const handleCreateMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTripForMovement) {
      alert("No active trip is associated with this movement compile request");
      return;
    }
    if (!newMovement.expectedArrivalDate || !newMovement.expectedArrivalTime) {
      alert("Please select Expected Arrival Date and Time for this journey");
      return;
    }

    try {
      const movementId = newMovement.movementId || "OM-" + Math.floor(100000 + Math.random() * 900000);
      const payload = {
        id: movementId,
        tripId: selectedTripForMovement.id,
        vehicleNumber: selectedTripForMovement.vehicleNumber,
        driverName: selectedTripForMovement.driverName,
        loadingConfirmNo: newMovement.loadingConfirmNo || '',
        lrNumber: newMovement.lrNumber || '',
        routeDetails: newMovement.routeDetails || '',
        consigneeName: newMovement.consigneeName || '',
        consigneeMobile: newMovement.consigneeMobile || '',
        unloadingPoint: newMovement.unloadingPoint || selectedTripForMovement.unloadingPoint || '',
        unloadingGoogleMapLocation: newMovement.unloadingGoogleMapLocation || '',
        googleMapDestination: newMovement.unloadingGoogleMapLocation || '',
        eWayBillNumber: newMovement.eWayBillNumber || '',
        eWayBillExpiryDate: newMovement.eWayBillExpiryDate || '',
        reportingDate: newMovement.reportingDate || '',
        reportingTime: newMovement.reportingTime || '',
        startKm: Number(newMovement.startKm) || selectedTripForMovement.startKm || 0,
        endKm: "",
        expectedArrivalDate: newMovement.expectedArrivalDate,
        expectedArrivalTime: newMovement.expectedArrivalTime,
        fuelIssuedLiters: Number(newMovement.fuelIssuedLiters) || 0,
        fuelCashCard: newMovement.fuelCashCard,
        timestamp: new Date().toISOString()
      };

      // 1. Create movement document
      await setDoc(doc(db, 'movements', movementId), payload);

      // 2. Set vehicle status flag to RUNNING and record status log
      await logVehicleStatusChange(
        selectedTripForMovement.vehicleNumber,
        'RUNNING',
        selectedTripForMovement.id,
        `Operations desk compiled Movement document: ${movementId}. Fuel allocated: ${payload.fuelIssuedLiters}L via ${payload.fuelCashCard.toUpperCase()}.`
      );

      // 3. Update active trip status to 'running'
      await updateDoc(doc(db, 'tripAssignments', selectedTripForMovement.id), {
        status: 'running',
        expectedUnloadingDate: newMovement.expectedArrivalDate,
        updatedAt: new Date().toISOString()
      });

      // 4. Notify Driver
      await addDoc(collection(db, 'notifications'), {
        type: 'status_update',
        title: `🚛 Dispatch Clearance: RUNNING!`,
        message: `Operations desk has generated Movement document ${movementId} for your trip. You are cleared to begin! Keep speeds within limits.`,
        timestamp: new Date().toISOString(),
        vehicleNumber: selectedTripForMovement.vehicleNumber,
        driverName: selectedTripForMovement.driverName,
        isRead: false
      });

      setShowAddMovement(false);
      setSelectedTripForMovement(null);
      alert(`🎉 Movement Dispatch compiled! Vehicle status transitioned to RUNNING! Document No: ${movementId}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'movements');
    }
  };

  const handleUpdateConsignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConsignment) return;

    try {
      // Ensure recordStatus is preserved or set to Active if not present
      const updatePayload = {
        ...editingConsignment,
        recordStatus: editingConsignment.recordStatus || 'Active'
      };
      await setDoc(doc(db, 'consignments', editingConsignment.id), updatePayload);

      // Autosave party details if modified/new
      if (editingConsignment.consignorName) {
        await savePartyToMaster(editingConsignment.consignorName, editingConsignment.consignorMobile);
      }
      if (editingConsignment.consigneeName) {
        await savePartyToMaster(editingConsignment.consigneeName, editingConsignment.consigneeMobile);
      }

      setShowEditConsignment(false);
      setEditingConsignment(null);
      setIsEditingConsignmentForm(false);
      alert("🎉 Consignment LR details updated!");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'consignments');
    }
  };

  const handleEditConsignmentFromList = (lr: Consignment) => {
    setEditingConsignment(lr);
    setIsEditingConsignmentForm(true);
    setShowEditConsignment(true);
  };

  const handleCancelEditConsignment = () => {
    setEditingConsignment(null);
    setIsEditingConsignmentForm(false);
    setShowEditConsignment(false);
  };

  const handleActivateConsignment = (id: string) => {
    askConfirmation(
      "Activate Consignment LR",
      "Activate this consignment record?",
      async () => {
        try {
          await updateDoc(doc(db, 'consignments', id), {
            recordStatus: 'Active'
          });
          showToast("✅ Consignment LR activated!");
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'consignments');
        }
      }
    );
  };

  const handleDeactivateConsignment = (id: string) => {
    askConfirmation(
      "Deactivate Consignment LR",
      "Deactivate this consignment record? (Record will be marked inactive but not deleted)",
      async () => {
        try {
          await updateDoc(doc(db, 'consignments', id), {
            recordStatus: 'Inactive'
          });
          showToast("⏸️ Consignment LR deactivated!");
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'consignments');
        }
      }
    );
  };

  const handleCancelConsignment = (id: string) => {
    askConfirmation(
      "Cancel Consignment LR (कन्साइनमेंट रद्द करें)",
      "Are you sure you want to Cancel this consignment? (क्या आप वाकई इस कन्साइनमेंट/LR को रद्द करना चाहते हैं?)",
      async () => {
        try {
          await updateDoc(doc(db, 'consignments', id), {
            status: 'cancelled'
          });
          showToast("❌ Consignment LR status set to [CANCELLED]!");
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'consignments');
        }
      }
    );
  };

  const handleDeleteConsignment = (id: string) => {
    askConfirmation(
      "Delete Consignment LR (कन्साइनमेंट मिटाएं)",
      "Are you sure you want to Delete this consignment permanently? (क्या आप वाकई इस कन्साइनमेंट/LR को हमेशा के लिए मिटाना चाहते हैं?)",
      async () => {
        try {
          await deleteDoc(doc(db, 'consignments', id));
          showToast("🗑️ Consignment LR Deleted permanently.");
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'consignments');
        }
      }
    );
  };

  // Manual Party and Route Master Actions
  const handleCreatePartyMasterManually = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMasterPartyName.trim()) return;
    const normName = newMasterPartyName.trim();
    
    // Check duplication
    const exists = partyMasters.some(p => p.partyName.toLowerCase() === normName.toLowerCase());
    if (exists) {
      alert("⚠️ This party already exists in master directory!");
      return;
    }

    const docId = 'party_man_' + Math.floor(100000 + Math.random() * 900000);
    try {
      await setDoc(doc(db, 'partyMaster', docId), {
        id: docId,
        partyName: normName,
        partyMobile: newMasterPartyMobile.trim() || '',
        createdAt: new Date().toISOString()
      });
      setNewMasterPartyName('');
      setNewMasterPartyMobile('');
      setShowAddPartyMaster(false);
      alert("✅ Party added to Master successfully!");
    } catch (err) {
      console.error(err);
      alert("❌ Failed to add Party Master.");
    }
  };

  const handleAddPartyContactRow = () => {
    setPartyForm(prev => ({
      ...prev,
      additionalContacts: [
        ...prev.additionalContacts,
        { id: `contact_${Date.now()}`, name: '', mobile: '', email: '' }
      ]
    }));
  };

  const handleUpdatePartyContact = (index: number, field: 'name' | 'mobile' | 'email', value: string) => {
    setPartyForm(prev => ({
      ...prev,
      additionalContacts: prev.additionalContacts.map((contact, idx) => idx === index ? ({ ...contact, [field]: value }) : contact)
    }));
  };

  const handleEditPartyMaster = (party: PartyMaster) => {
    const latestCourier = party.courierHistory?.length ? party.courierHistory[party.courierHistory.length - 1] : null;
    setEditingParty(party);
    setPartyForm({
      partyName: party.partyName || '',
      partyType: party.partyType === 'BROKER' ? 'BROKER' : 'CLIENT',
      placeCity: party.placeCity || '',
      state: party.state || '',
      broker: party.broker || '',
      contactPerson: party.contactPerson || '',
      mobileNumber: party.mobileNumber || party.partyMobile || '',
      alternateMobileNumber: party.alternateMobileNumber || '',
      email: party.email || '',
      additionalContacts: party.additionalContacts?.length ? party.additionalContacts : [{ id: 'contact_1', name: '', mobile: '', email: '' }],
      gstNumber: party.gstNumber || '',
      panNumber: party.panNumber || '',
      billingAddress: party.billingAddress || party.address || '',
      status: party.status || 'ACTIVE',
      documentsSent: latestCourier?.documentsSent === 'No' ? 'No' : 'Yes',
      courierCompany: latestCourier?.courierCompany || '',
      docketNumber: latestCourier?.docketNumber || '',
      dispatchDate: latestCourier?.dispatchDate || '',
      sentBy: latestCourier?.sentBy || '',
      receiverName: latestCourier?.receiverName || '',
      receivedDate: latestCourier?.receivedDate || '',
      receivedTime: latestCourier?.receivedTime || '',
      remarks: latestCourier?.remarks || ''
    });
    setShowPartyMasterModal(true);
  };

  const handleSavePartyMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partyForm.partyName.trim() || !partyForm.contactPerson.trim() || !partyForm.mobileNumber.trim() || !partyForm.placeCity.trim()) {
      alert('Party Name, Contact Person, Mobile Number and Place / City are required.');
      return;
    }

    const docId = editingParty?.id || 'party_' + Math.floor(100000 + Math.random() * 900000);
    const trackingFilled = Boolean(
      partyForm.courierCompany.trim() ||
      partyForm.docketNumber.trim() ||
      partyForm.dispatchDate ||
      partyForm.sentBy.trim() ||
      partyForm.receiverName.trim() ||
      partyForm.receivedDate ||
      partyForm.receivedTime ||
      partyForm.remarks.trim()
    );

    const basePayload: PartyMaster = {
      id: docId,
      partyName: partyForm.partyName.trim(),
      partyType: partyForm.partyType,
      placeCity: partyForm.placeCity.trim(),
      state: partyForm.state.trim(),
      broker: partyForm.broker.trim(),
      contactPerson: partyForm.contactPerson.trim(),
      mobileNumber: partyForm.mobileNumber.trim(),
      alternateMobileNumber: partyForm.alternateMobileNumber.trim(),
      email: partyForm.email.trim(),
      additionalContacts: partyForm.additionalContacts
        .filter(c => c.name.trim() || c.mobile.trim() || c.email.trim())
        .map(c => ({ id: c.id, name: c.name.trim(), mobile: c.mobile.trim(), email: c.email.trim() })),
      gstNumber: partyForm.gstNumber.trim(),
      panNumber: partyForm.panNumber.trim(),
      billingAddress: partyForm.billingAddress.trim(),
      status: partyForm.status,
      courierHistory: editingParty?.courierHistory ? [...editingParty.courierHistory] : [],
      createdAt: editingParty?.createdAt || new Date().toISOString(),
      partyMobile: partyForm.mobileNumber.trim(),
      address: partyForm.billingAddress.trim()
    };

    if (trackingFilled) {
      const historyItem = {
        id: `courier_${Date.now()}`,
        courierCompany: partyForm.courierCompany.trim(),
        docketNumber: partyForm.docketNumber.trim(),
        dispatchDate: partyForm.dispatchDate,
        dispatchTime: partyForm.receivedTime || '',
        documentsSent: partyForm.documentsSent,
        sentBy: partyForm.sentBy.trim(),
        receiverName: partyForm.receiverName.trim(),
        receivedDate: partyForm.receivedDate,
        receivedTime: partyForm.receivedTime,
        remarks: partyForm.remarks.trim()
      };
      basePayload.courierHistory = [...(basePayload.courierHistory || []), historyItem];
    }

    try {
      await setDoc(doc(db, 'partyMaster', docId), basePayload);
      alert(editingParty ? '✅ Party Master updated successfully!' : '✅ Party Master created successfully!');
      resetPartyForm();
      setShowPartyMasterModal(false);
    } catch (err) {
      console.error(err);
      alert('❌ Failed to save Party Master.');
    }
  };

  const handleDeletePartyMaster = (id: string) => {
    const pin = window.prompt('Enter Admin PIN to delete this Party Master record:');
    if (pin !== '1234') {
      alert('Access Denied: Incorrect PIN');
      return;
    }

    askConfirmation(
      'Delete Party (पार्टी मिटाएं)',
      'Are you sure you want to delete this client party master record? (क्या आप वाकई ग्राहक पार्टी रिकॉर्ड को मिटाना चाहते हैं?)',
      async () => {
        try {
          await deleteDoc(doc(db, 'partyMaster', id));
          showToast('👥 Party master record deleted!');
        } catch (err) {
          console.error(err);
          showToast('❌ Failed to delete Party master.', 'error');
        }
      }
    );
  };

  const resetRouteForm = () => {
    setRouteForm({ routeName: '', fromCity: '', toCity: '', viaRoute: '', distanceKm: '', transitHours: '', recordStatus: 'Active' });
    setEditingRoute(null);
  };

  const openAllTruckActivityDashboard = () => {
    setActiveTab('dispatch');
    setShowAddLoading(false);
    setShowEditLoading(false);
    setShowAddConsignment(false);
    setShowEditConsignment(false);
    setShowAssignTrip(false);
    setShowAddMovement(false);
    setShowAddVehicle(false);
    setShowEditVehicle(false);
    setShowAddDriver(false);
    setShowEditDriver(false);
    setShowAddPartyMaster(false);
    setShowPartyMasterModal(false);
    setShowAddRouteMaster(false);
    setShowRouteMasterModal(false);

    setEditingLoading(null);
    setEditingConsignment(null);
    setEditingVehicle(null);
    setEditingDriver(null);
    setSelectedTripForMovement(null);
    setSelectedLrForPrint(null);
    setSelectedLoadingParty(null);
    setShowPartySuggestions(false);
    clearVehicleAutocomplete();
    resetPartyForm();
    resetRouteForm();
    setIsViewOnlyDriver(false);
    setIsViewOnlyVehicle(false);
    setSearchQuery('');
    setActivityRefreshTick((prev) => prev + 1);
  };

  const handleEditRouteMaster = (route: RouteMaster) => {
    setEditingRoute(route);
    setRouteForm({
      routeName: route.routeName || '',
      fromCity: route.fromCity || route.loadingPoint || '',
      toCity: route.toCity || route.unloadingPoint || '',
      viaRoute: route.viaRoute || '',
      distanceKm: route.distanceKm?.toString() || '',
      transitHours: route.transitHours?.toString() || '',
      recordStatus: route.recordStatus || (route.active === false ? 'Inactive' : 'Active')
    });
    setShowRouteMasterModal(true);
  };

  const handleSaveRouteMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!routeForm.fromCity.trim() || !routeForm.toCity.trim()) {
      alert("⚠️ From City and To City are required.");
      return;
    }

    const lNorm = routeForm.fromCity.trim();
    const uNorm = routeForm.toCity.trim();
    const routeName = routeForm.routeName.trim() || `${lNorm} to ${uNorm}`;

    // Check duplication if creating new
    if (!editingRoute) {
      const exists = routeMasters.some(r => r.routeName.toLowerCase() === routeName.toLowerCase() || (r.fromCity.toLowerCase() === lNorm.toLowerCase() && r.toCity.toLowerCase() === uNorm.toLowerCase()));
      if (exists) {
        alert("⚠️ This route already exists in route directory!");
        return;
      }
    }

    try {
      const routeCode = editingRoute?.routeCode || await generateRouteCode();
      const createdAt = editingRoute?.createdAt || new Date().toISOString();
      const payload = {
        id: routeCode,
        routeCode,
        routeName,
        fromCity: lNorm,
        toCity: uNorm,
        viaRoute: routeForm.viaRoute.trim(),
        distanceKm: Number(routeForm.distanceKm) || 0,
        transitHours: Number(routeForm.transitHours) || 0,
        active: routeForm.recordStatus === 'Active',
        recordStatus: routeForm.recordStatus,
        createdAt
      };

      await setDoc(doc(db, 'routes', routeCode), payload);

      // Update legacy collection mirror for backward compatibility
      const legacyId = editingRoute?.id?.startsWith('route_') ? editingRoute.id : `route_man_${Math.floor(100000 + Math.random() * 900000)}`;
      await setDoc(doc(db, 'routeMaster', legacyId), {
        ...payload,
        id: legacyId,
        loadingPoint: lNorm,
        unloadingPoint: uNorm
      });

      alert(editingRoute ? "✅ Route updated successfully!" : "✅ Route added to Route Master directory!");
      resetRouteForm();
      setShowRouteMasterModal(false);
    } catch (err) {
      console.error(err);
      alert("❌ Failed to add Route Master.");
    }
  };

  const handleDeleteRouteMaster = (id: string) => {
    askConfirmation(
      "Delete Route (मार्ग मिटाएं)",
      "Are you sure you want to Delete this designated dispatch route master record? (क्या आप वाकई परिवहन मार्ग रिकॉर्ड को मिटाना चाहते हैं?)",
      async () => {
        try {
          // Read legacy doc to find linked routeCode or routeName
          try {
            const legacySnap = await getDoc(doc(db, 'routeMaster', id));
            if (legacySnap.exists()) {
              const data: any = legacySnap.data();
              const rc = data.routeCode;
              const rn = data.routeName;
              // delete corresponding new route if routeCode exists
              if (rc) {
                await deleteDoc(doc(db, 'routes', rc));
              } else if (rn) {
                // try to find by routeName
                const q = query(collection(db, 'routes'), where('routeName', '==', rn));
                const snap = await getDocs(q);
                snap.forEach(d => deleteDoc(doc(db, 'routes', d.id)));
              }
            }
          } catch (e) {
            console.error('Failed to cleanup new routes collection', e);
          }

          await deleteDoc(doc(db, 'routeMaster', id));
          showToast("🛣️ Route master record deleted!");
        } catch (err) {
          console.error(err);
          showToast("❌ Failed to delete Route master.", "error");
        }
      }
    );
  };

  // RESOLVE MAINTENANCE WORKSHOP TICKET status
  const handleUpdateTicketStatus = async (ticketId: string, nextStatus: 'assigned' | 'in_progress' | 'resolved' | 'closed') => {
    try {
      await updateDoc(doc(db, 'maintenanceTickets', ticketId), { status: nextStatus });
      alert(`🔧 Ticket ${ticketId} status changed to [${nextStatus.toUpperCase()}]`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'maintenanceTickets');
    }
  };

  // APPROVE / REJECT POD
  const handleApprovePod = async (tripId: string) => {
    try {
      // 1. Approve Pod document
      await updateDoc(doc(db, 'podUploads', tripId), { status: 'approved' });

      // 2. Set tripStatus to complete
      await updateDoc(doc(db, 'tripAssignments', tripId), { status: 'completed' });

      // 3. Unlock assigned driver state
      const matchingTrip = trips.find(t => t.id === tripId);
      if (matchingTrip?.driverId) {
        await updateDoc(doc(db, 'drivers', matchingTrip.driverId), { driverStatus: 'available' });
      }

      alert("✅ POD Approved! Trip finalized and vehicle set back to available status.");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'podUploads');
    }
  };

  const handleRejectPod = async (tripId: string) => {
    if (!podRejectionReason) {
      alert("Please provide a rejection reason code");
      return;
    }
    try {
      await updateDoc(doc(db, 'podUploads', tripId), {
        status: 'rejected',
        rejectionReason: podRejectionReason
      });

      // Reset tripAssignment status back to 'delivered' so driver can re-upload POD
      await updateDoc(doc(db, 'tripAssignments', tripId), { status: 'delivered' });

      setRejectingPodId(null);
      setPodRejectionReason('');
      alert("❌ POD Rejected. Notification sent back to driver for correction check.");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'podUploads');
    }
  };

  // Clear Alerts
  const handleMarkAlertRead = async (alertId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', alertId), { isRead: true });
    } catch (err) {
      console.error(err);
    }
  };

  // Delete Individual Trip Entry and reset linked Vehicle/Driver state
  const handleDeleteTrip = (tripId: string, vehicleNo: string, driverId: string) => {
    askConfirmation(
      "Delete Trip (यात्रा मिटाएं)",
      `Are you sure you want to delete Trip #${tripId}? This will reset Driver and Vehicle availability status. (क्या आप वाकई यात्रा #${tripId} को मिटाना चाहते हैं?)`,
      async () => {
        try {
          // 1. Delete trip assignment document
          await deleteDoc(doc(db, 'tripAssignments', tripId));

          // 2. Reset driver status to 'available'
          if (driverId) {
            await updateDoc(doc(db, 'drivers', driverId), {
              driverStatus: 'available'
            });
            await setDoc(doc(db, 'users', driverId), {
              driverStatus: 'available'
            }, { merge: true });
          }

          // 3. Reset vehicle status flag to null
          if (vehicleNo) {
            const vQuery = query(collection(db, 'vehicles'), where('vehicleNumber', '==', vehicleNo.trim().toUpperCase()));
            const vSnap = await getDocs(vQuery);
            for (const vDoc of vSnap.docs) {
              await updateDoc(doc(db, 'vehicles', vDoc.id), {
                statusFlag: null
              });
            }
          }

          // 4. Delete associated dispatch/movement documents if any exist
          const mvQuery = query(collection(db, 'movements'), where('tripId', '==', tripId));
          const mvSnap = await getDocs(mvQuery);
          for (const mvDoc of mvSnap.docs) {
            await deleteDoc(doc(db, 'movements', mvDoc.id));
          }

          // 5. Delete associated loading confirmations and consignments/LRs for cleaner state
          const lcQuery = query(collection(db, 'loadingConfirmations'), where('tripId', '==', tripId));
          const lcSnap = await getDocs(lcQuery);
          for (const lcDoc of lcSnap.docs) {
            await deleteDoc(doc(db, 'loadingConfirmations', lcDoc.id));
          }

          const csQuery = query(collection(db, 'consignments'), where('tripId', '==', tripId));
          const csSnap = await getDocs(csQuery);
          for (const csDoc of csSnap.docs) {
            await deleteDoc(doc(db, 'consignments', csDoc.id));
          }

          // 6. Delete notifications/alerts for this trip
          const ntQuery = query(collection(db, 'notifications'), where('tripId', '==', tripId));
          const ntSnap = await getDocs(ntQuery);
          for (const ntDoc of ntSnap.docs) {
            await deleteDoc(doc(db, 'notifications', ntDoc.id));
          }

          showToast(`🗑️ Trip ${tripId} and related transit entries successfully deleted. Driver and Vehicle are now available!`);
        } catch (err) {
          console.error("Error deleting trip: ", err);
          showToast("❌ Failed to delete trip successfully.", "error");
        }
      }
    );
  };

  // Clear All Transaction Data except Trucks and Drivers
  const handleResetAllOperationsData = () => {
    askConfirmation(
      "Clear All Transactional Entries (डेटा मिटाएं)",
      "🧹 WARNING: This will permanently delete all active Trips, Invoices, LRs, Live Movements, notifications, Maintenance Tickets, and transition audits. Registered Trucks & Driver profiles will be preserved & set to 'Available'. Do you wish to continue?",
      async () => {
        try {
          // 1. Clear tripAssignments
          const tripsSnap = await getDocs(collection(db, 'tripAssignments'));
          for (const d of tripsSnap.docs) {
            await deleteDoc(doc(db, 'tripAssignments', d.id));
          }

          // 2. Clear loadingConfirmations
          const lcSnap = await getDocs(collection(db, 'loadingConfirmations'));
          for (const d of lcSnap.docs) {
            await deleteDoc(doc(db, 'loadingConfirmations', d.id));
          }

          // 3. Clear consignments
          const csSnap = await getDocs(collection(db, 'consignments'));
          for (const d of csSnap.docs) {
            await deleteDoc(doc(db, 'consignments', d.id));
          }

          // 4. Clear movements
          const mvSnap = await getDocs(collection(db, 'movements'));
          for (const d of mvSnap.docs) {
            await deleteDoc(doc(db, 'movements', d.id));
          }

          // 5. Clear vehicleStatusAudit
          const audSnap = await getDocs(collection(db, 'vehicleStatusAudit'));
          for (const d of audSnap.docs) {
            await deleteDoc(doc(db, 'vehicleStatusAudit', d.id));
          }

          // 6. Clear notifications
          const ntSnap = await getDocs(collection(db, 'notifications'));
          for (const d of ntSnap.docs) {
            await deleteDoc(doc(db, 'notifications', d.id));
          }

          // 7. Clear podUploads
          const podSnap = await getDocs(collection(db, 'podUploads'));
          for (const d of podSnap.docs) {
            await deleteDoc(doc(db, 'podUploads', d.id));
          }

          // 8. Clear maintenance/workshop tickets
          const mtSnap = await getDocs(collection(db, 'maintenanceTickets'));
          for (const d of mtSnap.docs) {
            await deleteDoc(doc(db, 'maintenanceTickets', d.id));
          }

          // 9. Reset all vehicles back to available statusFlag: null
          const vehSnap = await getDocs(collection(db, 'vehicles'));
          for (const d of vehSnap.docs) {
            await updateDoc(doc(db, 'vehicles', d.id), {
              statusFlag: null
            });
          }

          // 10. Reset all drivers to state 'available'
          const drSnap = await getDocs(collection(db, 'drivers'));
          for (const d of drSnap.docs) {
            await updateDoc(doc(db, 'drivers', d.id), {
              driverStatus: 'available'
            });
            await setDoc(doc(db, 'users', d.id), {
              driverStatus: 'available'
            }, { merge: true });
          }

          showToast("✨ Success! All transactional database records cleared. Trucks registrar & Driver registry preserved perfectly in 'Available' state.");
        } catch (err) {
          console.error("Error wiping operational database: ", err);
          showToast("❌ Failed to clear database successfully.", "error");
        }
      }
    );
  };

  // Helper: Checks if date is past or extremely close (expiry alarm)
  const getExpiryLabel = (dateString?: string) => {
    if (!dateString) return { badge: 'No Date', color: 'text-slate-400 bg-slate-50' };
    const dateLimit = new Date(dateString);
    const today = new Date();
    const diffTime = dateLimit.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      return { badge: 'EXPIRED', color: 'text-rose-600 bg-rose-50 border border-rose-200' };
    } else if (diffDays <= 30) {
      return { badge: `EXPIRY IN ${diffDays} DAYS`, color: 'text-amber-600 bg-amber-50 border border-amber-200 animate-pulse' };
    }
    return { badge: 'COMPLIANT', color: 'text-emerald-600 bg-emerald-50' };
  };

  // Filter lists
  const filteredDrivers = drivers.filter(d =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.mobile.includes(searchQuery) ||
    d.driverCode.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredVehicles = vehicles.filter(v => {
    const q = vehicleListSearch.trim().toLowerCase();
    const linkedDriver = drivers.find(d => d.id === v.linkedDriverId || d.linkedVehicleNumber === v.vehicleNumber);
    if (!q) return true;
    return [
      v.vehicleNumber,
      v.vehicleType,
      v.ownerName,
      v.ownerMobile,
      v.linkedDriverName,
      linkedDriver?.name,
      linkedDriver?.mobile
    ].some(value => value?.toLowerCase().includes(q));
  });

  const activeAlertsCount = alerts.filter(a => !a.isRead).length;

  // Dynamic design accent styling classes
  const getAccentColorStyle = () => {
    switch (accentColor) {
      case 'emerald':
        return {
          primary: 'bg-emerald-600 hover:bg-emerald-700',
          bgLight: 'bg-emerald-50',
          text: 'text-emerald-700',
          border: 'border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500',
          badge: 'bg-emerald-600',
          ring: 'focus:ring-emerald-500',
          gradient: 'from-emerald-600 to-teal-550',
          borderAccent: 'border-emerald-500',
          borderLeftAccent: 'border-l-4 border-emerald-500',
          bgActive: 'bg-emerald-600 text-white shadow-md shadow-emerald-500/15',
          pills: 'bg-emerald-50 text-emerald-700 border-emerald-100',
          btnHover: 'hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
        };
      case 'rose':
        return {
          primary: 'bg-rose-600 hover:bg-rose-700',
          bgLight: 'bg-rose-50',
          text: 'text-rose-700',
          border: 'border-rose-200 focus:border-rose-500 focus:ring-rose-500',
          badge: 'bg-rose-600',
          ring: 'focus:ring-rose-500',
          gradient: 'from-rose-600 to-pink-555',
          borderAccent: 'border-rose-500',
          borderLeftAccent: 'border-l-4 border-rose-500',
          bgActive: 'bg-rose-600 text-white shadow-md shadow-rose-500/15',
          pills: 'bg-rose-50 text-rose-750 border-rose-100',
          btnHover: 'hover:bg-rose-50 hover:text-rose-750 hover:border-rose-200'
        };
      case 'amber':
        return {
          primary: 'bg-amber-500 hover:bg-amber-600',
          bgLight: 'bg-amber-55/10',
          text: 'text-amber-700',
          border: 'border-amber-200 focus:border-amber-500 focus:ring-amber-500',
          badge: 'bg-amber-500',
          ring: 'focus:ring-amber-500',
          gradient: 'from-amber-500 to-orange-555',
          borderAccent: 'border-amber-500',
          borderLeftAccent: 'border-l-4 border-amber-500',
          bgActive: 'bg-amber-500 text-white shadow-md shadow-amber-500/15',
          pills: 'bg-amber-50 text-amber-750 border-amber-105',
          btnHover: 'hover:bg-amber-50 hover:text-amber-750 hover:border-amber-200'
        };
      case 'violet':
        return {
          primary: 'bg-violet-600 hover:bg-violet-700',
          bgLight: 'bg-violet-50',
          text: 'text-violet-700',
          border: 'border-violet-200 focus:border-violet-500 focus:ring-violet-500',
          badge: 'bg-violet-600',
          ring: 'focus:ring-violet-500',
          gradient: 'from-violet-600 to-fuchsia-555',
          borderAccent: 'border-violet-500',
          borderLeftAccent: 'border-l-4 border-violet-500',
          bgActive: 'bg-violet-600 text-white shadow-md shadow-violet-500/15',
          pills: 'bg-violet-50 text-violet-700 border-violet-105',
          btnHover: 'hover:bg-violet-50 hover:text-violet-700 hover:border-violet-200'
        };
      case 'slate':
        return {
          primary: 'bg-slate-800 hover:bg-slate-900',
          bgLight: 'bg-slate-100',
          text: 'text-slate-850',
          border: 'border-slate-300 focus:border-slate-800 focus:ring-slate-800',
          badge: 'bg-slate-800',
          ring: 'focus:ring-slate-800',
          gradient: 'from-slate-700 to-slate-900',
          borderAccent: 'border-slate-800',
          borderLeftAccent: 'border-l-4 border-slate-800',
          bgActive: 'bg-slate-800 text-white shadow-md shadow-slate-805/15',
          pills: 'bg-slate-100 text-slate-850 border-slate-200 border',
          btnHover: 'hover:bg-slate-100 hover:text-slate-850 hover:border-slate-300'
        };
      default: // indigo
        return {
          primary: 'bg-indigo-600 hover:bg-indigo-700',
          bgLight: 'bg-indigo-50',
          text: 'text-indigo-700',
          border: 'border-indigo-200 focus:border-indigo-500 focus:ring-indigo-500',
          badge: 'bg-indigo-650',
          ring: 'focus:ring-indigo-500',
          gradient: 'from-indigo-600 to-blue-555',
          borderAccent: 'border-indigo-550',
          borderLeftAccent: 'border-l-4 border-indigo-500',
          bgActive: 'bg-indigo-600 text-white shadow-md shadow-indigo-500/15 font-bold',
          pills: 'bg-indigo-50 text-indigo-750 border-indigo-100',
          btnHover: 'hover:bg-indigo-50 hover:text-indigo-705 hover:border-indigo-200'
        };
    }
  };

  const themeDesign = getAccentColorStyle();
  const vehicleSuggestions = getVehicleSuggestions(vehicleSearch);
  const suggestionCount = vehicleSuggestions.length;
  const selectedSuggestion = highlightedSuggestionIndex >= 0 && highlightedSuggestionIndex < suggestionCount
    ? vehicleSuggestions[highlightedSuggestionIndex]
    : null;
  const filteredLoadingHistory = loadingConfirmations
    .filter((record) => {
      const q = loadingHistorySearch.trim().toLowerCase();
      if (q) {
        const matchesSearch = [
          record.vehicleNo,
          record.driverName,
          record.loadingParty,
          record.partyVendorInfo,
          record.loadingAddress,
          record.loadingPointLocation,
          record.routeDetails
        ].some(value => value?.toLowerCase().includes(q));
        if (!matchesSearch) return false;
      }
      if (loadingHistoryFilter === 'all') return true;
      if (loadingHistoryFilter === 'map_saved') return Boolean(record.googleMapLocation);
      if (loadingHistoryFilter === 'map_missing') return !record.googleMapLocation;
      return record.status === loadingHistoryFilter;
    })
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  const filteredLrHistory = consignments
    .filter((lr) => {
      const q = lrHistorySearch.trim().toLowerCase();
      if (q) {
        const matchesSearch = [
          lr.lrNumber,
          lr.vehicleNumber,
          lr.driverName,
          lr.consignorName,
          lr.consigneeName,
          lr.routeDetails
        ].some(value => value?.toLowerCase().includes(q));
        if (!matchesSearch) return false;
      }
      return lrHistoryFilter === 'all' || lr.paymentTerms === lrHistoryFilter;
    })
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  const filteredTripHistory = trips
    .filter((trip) => {
      const q = tripHistorySearch.trim().toLowerCase();
      if (q) {
        const matchesSearch = [
          trip.vehicleNumber,
          trip.driverName,
          trip.loadingPoint,
          trip.unloadingPoint
        ].some(value => value?.toLowerCase().includes(q));
        if (!matchesSearch) return false;
      }
      if (tripHistoryFilter === 'all') return true;
      if (tripHistoryFilter === 'late') {
        const tripVehicle = vehicles.find(v => normalizeVehicleNumber(v.vehicleNumber) === normalizeVehicleNumber(trip.vehicleNumber));
        return (tripVehicle ? getVehicleDisplayStatus(tripVehicle) === 'LATE' : false) || (trip as any).status === 'late';
      }
      return trip.status === tripHistoryFilter;
    })
    .sort((a, b) => new Date(b.updatedAt || b.assignedDate || 0).getTime() - new Date(a.updatedAt || a.assignedDate || 0).getTime());
  const filteredMovementHistory = movements
    .filter((movement) => {
      const q = movementHistorySearch.trim().toLowerCase();
      if (q) {
        const matchesSearch = [
          movement.vehicleNumber,
          movement.driverName,
          (movement as any).lrNumber,
          (movement as any).routeDetails,
          movement.route,
          (movement as any).consigneeName,
          (movement as any).consigneeMobile,
          (movement as any).eWayBillNumber,
          (movement as any).reportingDate
        ].some(value => value?.toString().toLowerCase().includes(q));
        if (!matchesSearch) return false;
      }
      if (movementHistoryFilter === 'all') return true;
      return (movement as any).status === movementHistoryFilter || (movement as any).movementStatus === movementHistoryFilter;
    })
    .sort((a, b) => new Date((b as any).createdAt || (b as any).movementDate || 0).getTime() - new Date((a as any).createdAt || (a as any).movementDate || 0).getTime());

  const startEditLoadingFromRecord = (record: LoadingConfirmation) => {
    setEditingLoading({
      ...record,
      status: record.status as any,
      loadingParty: record.loadingParty || record.partyVendorInfo || '',
      loadingAddress: record.loadingAddress || record.loadingPointLocation || '',
      partyVendorInfo: record.partyVendorInfo || record.loadingParty || '',
      loadingPointLocation: record.loadingPointLocation || record.loadingAddress || '',
      googleMapLocation: record.googleMapLocation || '',
      loadingDate: record.loadingDate || '',
      loadingTime: record.loadingTime || ''
    } as any);
    setShowAddLoading(false);
    setShowEditLoading(true);
    setVehicleSearch(record.vehicleNo || '');
  };

  if (!currentStaff) {
    const showBootstrapSetup = staffUsers.length === 0;
    return (
      <div className="dnk-desktop-ui min-h-screen w-full bg-slate-100 text-slate-800 flex items-center justify-center px-4">
        {showBootstrapSetup ? (
          <form onSubmit={handleBootstrapAdminSetup} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl text-left">
            <div className="mb-6">
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">DNK Operations</span>
              <h1 className="mt-1 text-xl font-black text-slate-950">Bootstrap Admin Setup</h1>
              <p className="mt-1 text-xs text-slate-500">No Operations staff exists yet. Create the first Admin account.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-extrabold text-slate-700">Admin Name</label>
                <input
                  type="text"
                  value={bootstrapAdminForm.staffName}
                  onChange={(e) => setBootstrapAdminForm(prev => ({ ...prev, staffName: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-extrabold text-slate-700">Username</label>
                <input
                  type="text"
                  value={bootstrapAdminForm.username}
                  onChange={(e) => setBootstrapAdminForm(prev => ({ ...prev, username: e.target.value.trim() }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-mono text-slate-900"
                  autoComplete="username"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-extrabold text-slate-700">Password</label>
                <input
                  type="password"
                  value={bootstrapAdminForm.password}
                  onChange={(e) => setBootstrapAdminForm(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                  autoComplete="new-password"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-extrabold text-slate-700">Confirm Password</label>
                <input
                  type="password"
                  value={bootstrapAdminForm.confirmPassword}
                  onChange={(e) => setBootstrapAdminForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            {bootstrapAdminError && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                {bootstrapAdminError}
              </div>
            )}

            <button type="submit" className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white hover:bg-indigo-700">
              Create Admin
            </button>
          </form>
        ) : (
          <form onSubmit={handleOperationsStaffLogin} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl text-left">
            <div className="mb-6">
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">DNK Operations</span>
              <h1 className="mt-1 text-xl font-black text-slate-950">Staff Login</h1>
              <p className="mt-1 text-xs text-slate-500">Username/password access for laptop and desktop operations staff.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-extrabold text-slate-700">Username</label>
                <input
                  type="text"
                  value={staffLoginForm.username}
                  onChange={(e) => setStaffLoginForm(prev => ({ ...prev, username: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                  autoComplete="username"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-extrabold text-slate-700">Password</label>
                <input
                  type="password"
                  value={staffLoginForm.password}
                  onChange={(e) => setStaffLoginForm(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            {staffLoginError && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                {staffLoginError}
              </div>
            )}

            <button type="submit" className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white hover:bg-indigo-700">
              Login
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="dnk-desktop-ui min-h-screen w-full min-w-0 bg-slate-50 font-sans text-slate-800">
      <style>{`
        .dnk-desktop-ui label {
          color: #1f2937;
          font-weight: 800;
        }

        .dnk-desktop-ui input,
        .dnk-desktop-ui select,
        .dnk-desktop-ui textarea {
          color: #111827;
          border-color: #cbd5e1;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
        }

        .dnk-desktop-ui input,
        .dnk-desktop-ui select {
          min-height: 48px;
        }

        .dnk-desktop-ui textarea {
          min-height: 96px;
        }

        .dnk-desktop-ui input::placeholder,
        .dnk-desktop-ui textarea::placeholder {
          color: #9ca3af;
          opacity: 1;
        }

        .dnk-desktop-ui input[readonly],
        .dnk-desktop-ui textarea[readonly],
        .dnk-desktop-ui input:disabled,
        .dnk-desktop-ui select:disabled,
        .dnk-desktop-ui textarea:disabled {
          background: #f1f5f9;
          color: #475569;
          border-color: #dbe3ec;
          cursor: not-allowed;
        }

        .dnk-desktop-ui input:not([readonly]):not(:disabled),
        .dnk-desktop-ui select:not(:disabled),
        .dnk-desktop-ui textarea:not([readonly]):not(:disabled) {
          background: #ffffff;
        }

        .dnk-desktop-ui h2,
        .dnk-desktop-ui h3,
        .dnk-desktop-ui h4 {
          border-left: 4px solid #2563eb;
          padding-left: 0.75rem;
          letter-spacing: 0;
        }

        .dnk-desktop-ui table {
          color: #334155;
        }

        .dnk-desktop-ui thead {
          background: #eef2ff;
        }

        .dnk-desktop-ui tbody tr:hover {
          background: #f8fafc;
        }

        .dnk-desktop-ui td,
        .dnk-desktop-ui th {
          border-color: #e2e8f0;
        }

        .dnk-desktop-ui .rounded-3xl {
          border-color: #dbe3ec;
        }

        .dnk-desktop-ui .erp-menu-button {
          min-height: 44px;
          border-radius: 0.5rem;
        }
      `}</style>
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[200px] border-r border-slate-200 bg-white px-3 py-5 shadow-sm md:flex md:flex-col lg:w-[180px]">
        <div className="border-b border-slate-200 pb-4">
          <span className="block text-[10px] font-black uppercase tracking-widest text-indigo-600">DNK Operations</span>
          <strong className="mt-1 block text-base font-black text-slate-950">ERP Menu</strong>
        </div>

        <nav className="mt-5 flex flex-1 flex-col gap-1.5 text-left text-[11px] font-extrabold text-slate-700">
          <button type="button" onClick={() => openOperationsTab('loading')} className="erp-menu-button flex items-center gap-3 px-3 text-left transition hover:bg-amber-50 hover:text-amber-900">
            <Layers className="h-4 w-4 text-amber-600" />
            <span>Loading Confirmation</span>
          </button>
          <button type="button" onClick={() => openOperationsTab('consignments')} className="erp-menu-button flex items-center gap-3 px-3 text-left transition hover:bg-indigo-50 hover:text-indigo-900">
            <ClipboardList className="h-4 w-4 text-indigo-600" />
            <span>Booking / New Consignment</span>
          </button>
          <button type="button" onClick={() => openOperationsTab('tracking')} className="erp-menu-button flex items-center gap-3 px-3 text-left transition hover:bg-emerald-50 hover:text-emerald-900">
            <Truck className="h-4 w-4 text-emerald-600" />
            <span>Movement / Dispatch</span>
          </button>
          <button type="button" onClick={() => openOperationsTab('drivers')} className="erp-menu-button flex items-center gap-3 px-3 text-left transition hover:bg-sky-50 hover:text-sky-900">
            <Users className="h-4 w-4 text-sky-600" />
            <span>Driver Master</span>
          </button>
          <button type="button" onClick={() => openOperationsTab('vehicles')} className="erp-menu-button flex items-center gap-3 px-3 text-left transition hover:bg-rose-50 hover:text-rose-900">
            <Truck className="h-4 w-4 text-rose-600" />
            <span>Vehicle Master</span>
          </button>
          <button type="button" onClick={() => openOperationsTab('workshop')} className="erp-menu-button flex items-center gap-3 px-3 text-left transition hover:bg-slate-100 hover:text-slate-950">
            <Users className="h-4 w-4 text-slate-600" />
            <span>Party Master</span>
          </button>
          <button type="button" onClick={() => openOperationsTab('reports')} className="erp-menu-button flex items-center gap-3 px-3 text-left transition hover:bg-slate-100 hover:text-slate-950">
            <MapPin className="h-4 w-4 text-slate-600" />
            <span>Route Master</span>
          </button>
          <button type="button" onClick={() => openOperationsTab('alerts')} className="erp-menu-button flex items-center gap-3 px-3 text-left transition hover:bg-slate-100 hover:text-slate-950">
            <ShieldAlert className="h-4 w-4" />
            <span>Staff/User</span>
          </button>
        </nav>

        <div className="border-t border-slate-200 pt-4 text-[11px] text-slate-500">
          <div className="flex items-center justify-between">
            <span className="font-bold">Firestore</span>
            <span className="font-mono font-black text-emerald-600">ONLINE</span>
          </div>
        </div>
      </aside>

      <main className="w-full min-w-0 px-4 py-5 md:ml-[200px] md:w-[calc(100%-200px)] md:px-5 lg:ml-[180px] lg:w-[calc(100%-180px)] lg:px-6">
      {/* OPERATIONS HEADER BANNER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="text-left">
          <span className={`text-[10px] font-bold ${themeDesign.text} ${themeDesign.bgLight} border border-slate-205 px-2.5 py-1 rounded-full uppercase tracking-wider font-mono inline-block mb-1.5`}>
            {languageMode === 'hindi' ? 'प्रशासक संचालन पैनल' : 'Admin Operations Panel'}
          </span>
          <h2 className="text-xl font-black tracking-tight text-slate-950">
            {languageMode === 'hindi' ? 'डीएनके लॉजिस्टिक्स डिस्पैच कंसोल' : 'DNK Fleet Dispatch Console'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {languageMode === 'hindi' 
              ? 'वास्तविक समय टेलीमेट्री निगरानी, ​​​​चालक शेड्यूलिंग, और डिजिटल एलआर बील्टी हब।'
              : 'Real-time telemetry monitoring, driver scheduling, and digital POD processing hub.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Aesthetic theme customiser select dot items */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200/60 shadow-sm text-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Theme:</span>
            <span className="text-[10px] font-extrabold text-slate-700">Light</span>
            <div className="hidden items-center gap-1.5">
              {[
                { id: 'indigo', color: 'bg-indigo-600' },
                { id: 'emerald', color: 'bg-emerald-500' },
                { id: 'rose', color: 'bg-rose-500' },
                { id: 'amber', color: 'bg-amber-500' },
                { id: 'violet', color: 'bg-violet-600' },
                { id: 'slate', color: 'bg-slate-800' },
              ].map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => setAccentColor(theme.id as any)}
                  className={`w-3.5 h-3.5 rounded-full cursor-pointer transition-all border ${
                    accentColor === theme.id ? 'scale-125 border-slate-900 ring-2 ring-slate-100 shadow' : 'border-transparent opacity-80 hover:opacity-100'
                  } ${theme.color}`}
                />
              ))}
            </div>
            
            <div className="h-4 w-px bg-slate-200 mx-1" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lang:</span>
            <select
              value={languageMode}
              onChange={(e) => setLanguageMode(e.target.value as any)}
              className="bg-transparent border-0 text-[10px] font-extrabold focus:outline-none focus:ring-0 text-slate-700 cursor-pointer pr-1"
            >
              <option value="bilingual">Bilingual (द्विभाषी)</option>
              <option value="english">English only</option>
              <option value="hindi">हिन्दी केवल</option>
            </select>
          </div>

          <button
            onClick={handleSeedDemoData}
            className={`px-4 py-2.5 ${themeDesign.primary} active:scale-95 text-white font-semibold text-xs rounded-xl shadow-md flex items-center gap-2 transition-all cursor-pointer font-mono border border-transparent`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" style={{ animationDuration: '6s' }} />
            <span>SEED DEMO</span>
          </button>

          <span className="text-[11px] font-bold text-slate-550 font-mono hidden md:inline-block bg-white border border-slate-200/60 px-3.5 py-2.5 rounded-xl shadow-sm">
            UTC: {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </span>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
            <div className="text-right">
              <div className="font-black text-slate-900">{currentStaff.staffName}</div>
              <div className="text-[10px] font-bold text-slate-500">{currentStaff.role}</div>
            </div>
            <button type="button" onClick={handleOperationsStaffLogout} className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] font-black text-slate-700 hover:bg-slate-200">
              Logout
            </button>
          </div>
        </div>
      </div>

      <details className="mb-5 rounded-2xl border border-slate-200 bg-white p-2 text-[11px] font-extrabold text-slate-700 shadow-sm md:hidden">
        <summary className="cursor-pointer rounded-lg bg-slate-100 px-3 py-2 text-slate-900">ERP Menu</summary>
        <div className="mt-2 grid grid-cols-1 gap-2">
          <button type="button" onClick={() => openOperationsTab('loading')} className="rounded-lg bg-amber-50 px-3 py-2 text-left text-amber-900">Loading Confirmation</button>
          <button type="button" onClick={() => openOperationsTab('consignments')} className="rounded-lg bg-indigo-50 px-3 py-2 text-left text-indigo-900">Booking / New Consignment</button>
          <button type="button" onClick={() => openOperationsTab('tracking')} className="rounded-lg bg-emerald-50 px-3 py-2 text-left text-emerald-900">Movement / Dispatch</button>
          <button type="button" onClick={() => openOperationsTab('drivers')} className="rounded-lg bg-sky-50 px-3 py-2 text-left text-sky-900">Driver Master</button>
          <button type="button" onClick={() => openOperationsTab('vehicles')} className="rounded-lg bg-rose-50 px-3 py-2 text-left text-rose-900">Vehicle Master</button>
          <button type="button" onClick={() => openOperationsTab('workshop')} className="rounded-lg bg-slate-100 px-3 py-2 text-left">Party Master</button>
          <button type="button" onClick={() => openOperationsTab('reports')} className="rounded-lg bg-slate-100 px-3 py-2 text-left">Route Master</button>
          <button type="button" onClick={() => openOperationsTab('alerts')} className="rounded-lg bg-slate-50 px-3 py-2 text-left text-slate-700">Staff/User</button>
        </div>
      </details>

      {/* ERP MAIN WORKSPACE */}
      <section className="w-full min-w-0">
        <div className="w-full min-w-0">
          
          {/* Main Workspace Contents (Tabs & Tables Left Column) */}
          <div className="w-full min-w-0 bg-white rounded-3xl border border-slate-200/55 p-5 shadow-sm min-h-[500px] transition-all duration-300 xl:p-6">
          <div className="mb-6 flex flex-col gap-4 border-b border-slate-100 pb-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="text-left">
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Right Main Workspace</span>
              <h3 className="mt-1 text-base font-black text-slate-950">DNK Fleet Dispatch Console</h3>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
              <button
                type="button"
                onClick={openAllTruckActivityDashboard}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-left font-bold text-slate-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
              >
                All Truck Activity
              </button>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">Search</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">Filters</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">Truck Activity Table</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">History</span>
            </div>
          </div>
          {/* Tab Selector buttons Row with Wrap & Sidebar Toggle */}
          <div className="hidden">
            <div className="flex flex-wrap gap-2 text-slate-500 font-bold text-xs">
              {[
                { id: 'dispatch', label: '⚛️ ALL TRUCK ACTIVITY', num: 0, isCritical: false as boolean | undefined },
                { id: 'consignments', label: '📝 CONSIGNMENTS & LR', num: consignments.length, isCritical: false as boolean | undefined },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (tab.id === 'dispatch') {
                      openAllTruckActivityDashboard();
                      return;
                    }
                    setActiveTab(tab.id as any);
                    setSearchQuery('');
                  }}
                  className={`py-2 px-3.5 rounded-xl flex items-center gap-1.5 whitespace-nowrap active:scale-95 transition-all relative cursor-pointer font-bold duration-150 ${
                    activeTab === tab.id
                      ? `${themeDesign.bgActive}`
                      : `text-slate-650 bg-slate-50 hover:bg-slate-100 ${themeDesign.btnHover}`
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.num > 0 && (
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                      tab.isCritical ? 'bg-rose-600 animate-pulse text-white' : 'bg-slate-200 text-slate-800'
                    }`}>
                      {tab.num}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* QUICK ACTIONS SIDEBAR TOGGLE BUTTON */}
            <button
              type="button"
              onClick={() => setShowSidebar(!showSidebar)}
              className={`flex items-center gap-2 py-2 px-4 rounded-xl border font-black text-xs cursor-pointer select-none transition-all duration-200 active:scale-95 ${
                showSidebar 
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-705' 
                  : `${themeDesign.gradient} text-white hover:opacity-95 shadow`
              }`}
            >
              <span>📋</span>
              <span>
                {showSidebar 
                  ? (languageMode === 'hindi' ? 'प्रपत्र छुपाएं' : 'COLLAPSE FORMS PANEL') 
                  : (languageMode === 'hindi' ? 'प्रपत्र दिखाएं' : 'EXPAND FORMS PANEL')
                }
              </span>
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2 font-mono">
              <RefreshCw className="w-10 h-10 animate-spin" />
              <span>Realtime Cloud Database Syncing, please stand by...</span>
            </div>
          ) : (
            <>
              {/* ==================== TAB 1: ALL TRUCK ACTIVITY ==================== */}
              {activeTab === 'dispatch' && (
                <div className="space-y-6 text-left">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900">ALL TRUCK ACTIVITY</h2>
                      <p className="text-xs text-slate-500">Operations fleet dashboard driven by vehicle status flags, route activity, ETA performance, and current location.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setActivityRefreshTick((prev) => prev + 1)}
                        className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer max-w-fit transition-all"
                        title="Refresh live fleet data"
                      >
                        <RefreshCw className="w-4 h-4" />
                        REFRESH NOW
                      </button>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider">Auto refresh every 30 seconds</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">STATUS FILTERS</span>
                    <div className="flex flex-wrap gap-2">
                      {['all', 'LOADING FIND', 'LOADING CONFIRM', 'LOADING DONE', 'MOVEMENT PENDING', 'RUNNING', 'LATE', 'UNLOADING REPORTING', 'UNLOADING DONE', 'MAINTENANCE', 'WITHOUT DRIVER'].map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setActivityFilter(status as any)}
                          className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition ${activityFilter === status ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                        >
                          {status === 'all' ? 'Show All' : status.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-slate-400">Search By</span>
                        <p className="text-xs text-slate-500">Vehicle Number, Driver Name, Mobile Number, Route</p>
                      </div>
                      <div className="text-right text-[11px] text-slate-500">Showing {activityRows.length} of {totalVehicles}</div>
                    </div>
                    <div className="mt-4 relative">
                      <input
                        type="text"
                        value={activitySearch}
                        onChange={(e) => setActivitySearch(e.target.value)}
                        placeholder="Search fleet by vehicle, driver, mobile or route..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400"
                      />
                      {activitySearch && (
                        <button
                          type="button"
                          onClick={() => setActivitySearch('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="w-full min-w-0 max-w-full overflow-x-auto border border-slate-200 rounded-3xl bg-white">
                    <table className="min-w-max text-left border-collapse text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-100">
                        <tr>
                          <th className="p-4">Vehicle No</th>
                          <th className="p-4">Driver Name</th>
                          <th className="p-4">Current Status</th>
                          <th className="p-4">Loading Point</th>
                          <th className="p-4">Unloading Point</th>
                          <th className="p-4">Start KM</th>
                          <th className="p-4">Current KM</th>
                          <th className="p-4">Trip Duration</th>
                          <th className="p-4">ETA</th>
                          <th className="p-4">Late By</th>
                          <th className="p-4">Advance Amount</th>
                          <th className="p-4">Fuel Issued</th>
                          <th className="p-4">Last Updated</th>
                          <th className="p-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                        {activityRows.map((row) => {
                          const badge = getVehicleBadge(row.vehicle);
                          return (
                            <tr key={row.vehicle.id} className="hover:bg-slate-50/75 transition-colors">
                              <td className="p-4 font-mono text-slate-900">{row.vehicle.vehicleNumber}</td>
                              <td className="p-4">{row.driver?.name || row.trip?.driverName || 'N/A'}</td>
                              <td className="p-4">
                                <span className={truckFlagBadgeClassName} style={badge.style}>
                                  {badge.label}
                                </span>
                              </td>
                              <td className="p-4">{row.trip?.loadingPoint || '—'}</td>
                              <td className="p-4">{row.trip?.unloadingPoint || '—'}</td>
                              <td className="p-4">{row.startKm}</td>
                              <td className="p-4">{row.currentKm}</td>
                              <td className="p-4">{row.tripDuration}</td>
                              <td className="p-4">{row.etaLabel}</td>
                              <td className="p-4">{row.lateBy}</td>
                              <td className="p-4">{row.movement?.advanceAmount || '—'}</td>
                              <td className="p-4">{row.movement?.fuelIssued || '—'}</td>
                              <td className="p-4 font-mono text-[11px] text-slate-500">{row.lastUpdated && row.lastUpdated !== 'N/A' ? new Date(row.lastUpdated).toLocaleString() : '—'}</td>
                              <td className="p-4">
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleViewActivityTab('vehicles', row.vehicle.vehicleNumber)}
                                    className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                                  >
                                    View Vehicle
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleViewActivityTab('drivers', row.driver?.name || '')}
                                    className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                                  >
                                    View Driver
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleViewActivityTab('consignments', row.trip?.id || '')}
                                    className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                                  >
                                    View LR
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleViewActivityTab('tracking', row.vehicle.vehicleNumber)}
                                    className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                                  >
                                    View Movement
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleViewActivityTab('pod', row.trip?.id || '')}
                                    className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                                  >
                                    View POD
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {activityRows.length === 0 && (
                      <div className="p-8 text-slate-500 text-sm text-center">
                        No trucks match the current status filter or search query.
                      </div>
                    )}
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-sm font-black text-slate-900">History</h3>
                        <p className="text-xs text-slate-500">Recent truck status activity from the live operations audit trail.</p>
                      </div>
                      <span className="text-[11px] font-bold text-slate-400">{statusAudits.length} audit records</span>
                    </div>
                    <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-2xl border border-slate-200">
                      <table className="min-w-max text-left text-xs">
                        <thead className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="p-3">Time</th>
                            <th className="p-3">Vehicle</th>
                            <th className="p-3">Status</th>
                            <th className="p-3">Trip</th>
                            <th className="p-3">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {statusAudits
                            .slice()
                            .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
                            .slice(0, 8)
                            .map((audit) => (
                              <tr key={audit.id || `${audit.vehicleNumber}-${audit.timestamp}`} className="hover:bg-slate-50">
                                <td className="p-3 font-mono text-[11px] text-slate-500">
                                  {audit.timestamp ? new Date(audit.timestamp).toLocaleString() : '-'}
                                </td>
                                <td className="p-3 font-mono font-bold text-slate-900">{audit.vehicleNumber || '-'}</td>
                                <td className="p-3">
                                  <span className={truckFlagBadgeClassName} style={getTruckFlagStyle(audit.newStatus)}>
                                    {audit.newStatus || '-'}
                                  </span>
                                </td>
                                <td className="p-3 font-mono text-[11px]">{audit.tripId || '-'}</td>
                                <td className="p-3">{audit.remarks || '-'}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {statusAudits.length === 0 && (
                        <div className="p-8 text-center text-sm text-slate-500">No history records found.</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ==================== TAB: CONSIGNMENTS LR MANAGEMENT ==================== */}
              {activeTab === 'consignments' && (
                <div className="space-y-6 text-left">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900">CONSIGNMENT & LR MANAGEMENT</h2>
                      <p className="text-xs text-slate-500">View, search, edit, and manage all Lorry Receipts (LR) records with record status control (Active/Inactive).</p>
                    </div>
                    <button
                      onClick={() => setShowAddConsignment(true)}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-2 cursor-pointer transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      NEW LR BOOKING
                    </button>
                  </div>

                  {/* Search & Filter Section */}
                  <div className="rounded-3xl border border-slate-200 bg-white p-4 space-y-4">
                    {/* Search Box */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-2">Search By</span>
                        <input
                          type="text"
                          value={consignmentSearchQuery}
                          onChange={(e) => setConsignmentSearchQuery(e.target.value)}
                          placeholder="Search LR Number, Vehicle, Consignor, or Consignee..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400"
                        />
                      </div>
                      {consignmentSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setConsignmentSearchQuery('')}
                          className="mt-auto px-3 py-3 text-slate-500 hover:text-slate-700 font-bold"
                        >
                          ✕ Clear
                        </button>
                      )}
                    </div>

                    {/* Status Filter Buttons */}
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-2">Record Status Filter</span>
                      <div className="flex flex-wrap gap-2">
                        {['all', 'active', 'inactive'].map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => setConsignmentRecordStatusFilter(status as any)}
                            className={`px-4 py-2 rounded-full text-[11px] font-bold transition-all ${
                              consignmentRecordStatusFilter === status
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {status === 'all' ? 'All Records' : status === 'active' ? '✅ Active' : '⛔ Inactive'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* LR List Table */}
                  <div className="w-full min-w-0 max-w-full overflow-x-auto border border-slate-200 rounded-3xl bg-white">
                    <table className="min-w-max text-left border-collapse text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-100">
                        <tr>
                          <th className="p-4">LR No</th>
                          <th className="p-4">LR Date</th>
                          <th className="p-4">Consignor</th>
                          <th className="p-4">Consignee</th>
                          <th className="p-4">Vehicle No</th>
                          <th className="p-4">Route</th>
                          <th className="p-4">Record Status</th>
                          <th className="p-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                        {consignments
                          .filter((lr) => {
                            // Filter by search query
                            if (consignmentSearchQuery.trim()) {
                              const q = consignmentSearchQuery.toLowerCase();
                              const matchesSearch = [
                                lr.lrNumber,
                                lr.vehicleNumber,
                                lr.consignorName,
                                lr.consigneeName
                              ].some((val) => val?.toLowerCase().includes(q));
                              if (!matchesSearch) return false;
                            }

                            // Filter by record status
                            const recordStatus = lr.recordStatus || 'Active';
                            if (consignmentRecordStatusFilter === 'active' && recordStatus !== 'Active') return false;
                            if (consignmentRecordStatusFilter === 'inactive' && recordStatus !== 'Inactive') return false;

                            return true;
                          })
                          .map((lr) => {
                            const recordStatus = lr.recordStatus || 'Active';
                            const statusBg = recordStatus === 'Active' 
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                              : 'bg-slate-100 text-slate-700 border-slate-200';
                            return (
                              <tr key={lr.id} className="hover:bg-slate-50/75 transition-colors">
                                <td className="p-4 font-mono font-bold text-slate-900">{lr.lrNumber}</td>
                                <td className="p-4">{lr.lrDate || '—'}</td>
                                <td className="p-4">{lr.consignorName || '—'}</td>
                                <td className="p-4">{lr.consigneeName || '—'}</td>
                                <td className="p-4 font-mono">{lr.vehicleNumber || '—'}</td>
                                <td className="p-4">{lr.remarks?.substring(0, 20) || '—'}</td>
                                <td className="p-4">
                                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-bold ${statusBg}`}>
                                    {recordStatus === 'Active' ? '✅ Active' : '⛔ Inactive'}
                                  </span>
                                </td>
                                <td className="p-4">
                                  <div className="flex flex-wrap gap-1">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedLrForPrint(lr)}
                                      className="px-2 py-1 text-[10px] font-bold rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                                      title="View LR details"
                                    >
                                      👁️ View
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleEditConsignmentFromList(lr)}
                                      className="px-2 py-1 text-[10px] font-bold rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors"
                                      title="Edit LR record"
                                    >
                                      ✏️ Edit
                                    </button>
                                    {recordStatus === 'Active' && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeactivateConsignment(lr.id)}
                                        className="px-2 py-1 text-[10px] font-bold rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200 transition-colors"
                                        title="Deactivate record"
                                      >
                                        ⛔ Deactivate
                                      </button>
                                    )}
                                    {recordStatus === 'Inactive' && (
                                      <button
                                        type="button"
                                        onClick={() => handleActivateConsignment(lr.id)}
                                        className="px-2 py-1 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
                                        title="Activate record"
                                      >
                                        ✅ Activate
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                    {consignments.filter((lr) => {
                      if (consignmentSearchQuery.trim()) {
                        const q = consignmentSearchQuery.toLowerCase();
                        return [lr.lrNumber, lr.vehicleNumber, lr.consignorName, lr.consigneeName]
                          .some((val) => val?.toLowerCase().includes(q));
                      }
                      const recordStatus = lr.recordStatus || 'Active';
                      if (consignmentRecordStatusFilter === 'active' && recordStatus !== 'Active') return false;
                      if (consignmentRecordStatusFilter === 'inactive' && recordStatus !== 'Inactive') return false;
                      return true;
                    }).length === 0 && (
                      <div className="p-8 text-slate-500 text-sm text-center">
                        No LR records match the search or filter criteria.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'loading' && (
                <div className="space-y-6 text-left">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900">Loading Confirmation</h2>
                      <p className="text-xs text-slate-500">List-first loading history with existing edit, cancel and delete actions.</p>
                    </div>
                    <button type="button" onClick={() => setShowAddLoading(true)} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-2 cursor-pointer">
                      <Plus className="w-4 h-4" />
                      New Loading
                    </button>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                      <input value={loadingHistorySearch} onChange={(e) => setLoadingHistorySearch(e.target.value)} placeholder="Search loading, vehicle, party, route..." className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm" />
                      <div className="flex flex-wrap gap-2">
                        {[
                          ['all', 'All'],
                          ['confirmed', 'Confirmed'],
                          ['pending', 'Pending'],
                          ['cancelled', 'Cancelled'],
                          ['map_saved', 'Map Saved'],
                          ['map_missing', 'Map Missing']
                        ].map(([value, label]) => (
                          <button key={value} type="button" onClick={() => setLoadingHistoryFilter(value as any)} className={`px-3 py-2 rounded-full text-[11px] font-bold ${loadingHistoryFilter === value ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-3xl border border-slate-200 bg-white">
                    <table className="min-w-max text-left text-xs">
                      <thead className="text-[10px] font-black uppercase text-slate-500">
                        <tr>
                          <th className="p-3">Loading No</th>
                          <th className="p-3">Vehicle</th>
                          <th className="p-3">Driver</th>
                          <th className="p-3">Party</th>
                          <th className="p-3">Route</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredLoadingHistory.map(record => (
                          <tr key={record.id} className="hover:bg-slate-50">
                            <td className="p-3 font-mono font-bold">{record.loadingNo || record.id}</td>
                            <td className="p-3 font-mono">{record.vehicleNo || '-'}</td>
                            <td className="p-3">{record.driverName || '-'}</td>
                            <td className="p-3">{record.loadingParty || record.partyVendorInfo || '-'}</td>
                            <td className="p-3">{record.routeDetails || '-'}</td>
                            <td className="p-3">{record.status || '-'}</td>
                            <td className="p-3">
                              <div className="flex flex-wrap gap-1.5">
                                <button type="button" onClick={() => window.alert(`Loading: ${record.loadingNo || record.id}\nVehicle: ${record.vehicleNo || '-'}\nDriver: ${record.driverName || '-'}\nParty: ${record.loadingParty || record.partyVendorInfo || '-'}\nRoute: ${record.routeDetails || '-'}`)} className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-bold">View</button>
                                <button type="button" onClick={() => startEditLoadingFromRecord(record)} className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 font-bold">Edit</button>
                                <button type="button" onClick={() => handleDeleteLoading(record.id)} className="px-2 py-1 rounded-full bg-rose-100 text-rose-700 font-bold">Delete</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredLoadingHistory.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No loading records found.</div>}
                  </div>
                </div>
              )}

              {activeTab === 'tracking' && (
                <div className="space-y-6 text-left">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900">Movement / Dispatch</h2>
                      <p className="text-xs text-slate-500">Movement history first; create movement opens the existing dispatch form.</p>
                    </div>
                    <button type="button" onClick={() => setShowAddMovement(true)} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-2 cursor-pointer">
                      <Plus className="w-4 h-4" />
                      New Movement
                    </button>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                      <input value={movementHistorySearch} onChange={(e) => setMovementHistorySearch(e.target.value)} placeholder="Search movement, vehicle, driver, LR, route, consignee, E-Way..." className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm" />
                      <div className="flex flex-wrap gap-2">
                        {[
                          ['all', 'All'],
                          ['running', 'Running'],
                          ['completed', 'Completed']
                        ].map(([value, label]) => (
                          <button key={value} type="button" onClick={() => setMovementHistoryFilter(value as any)} className={`px-3 py-2 rounded-full text-[11px] font-bold ${movementHistoryFilter === value ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-3xl border border-slate-200 bg-white">
                    <table className="min-w-max text-left text-xs">
                      <thead className="text-[10px] font-black uppercase text-slate-500">
                        <tr>
                          <th className="p-3">Movement</th>
                          <th className="p-3">Vehicle</th>
                          <th className="p-3">Driver</th>
                          <th className="p-3">LR</th>
                          <th className="p-3">Route</th>
                          <th className="p-3">Consignee</th>
                          <th className="p-3">Mobile</th>
                          <th className="p-3">E-Way Bill</th>
                          <th className="p-3">E-Way Expiry</th>
                          <th className="p-3">Reporting</th>
                          <th className="p-3">Expected Arrival</th>
                          <th className="p-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredMovementHistory.map(movement => {
                          const linkedLr = consignments.find(lr => lr.tripId === movement.tripId || lr.id === (movement as any).lrNumber || lr.lrNumber === (movement as any).lrNumber);
                          return (
                            <tr key={movement.id} className="hover:bg-slate-50">
                              <td className="p-3 font-mono font-bold">{movement.movementNumber || (movement as any).movementId || movement.id}</td>
                              <td className="p-3 font-mono">{movement.vehicleNumber || '-'}</td>
                              <td className="p-3">{movement.driverName || '-'}</td>
                              <td className="p-3 font-mono">{(movement as any).lrNumber || linkedLr?.lrNumber || linkedLr?.id || '-'}</td>
                              <td className="p-3 max-w-[200px] truncate">{(movement as any).routeDetails || movement.route || linkedLr?.routeDetails || '-'}</td>
                              <td className="p-3">{(movement as any).consigneeName || linkedLr?.consigneeName || '-'}</td>
                              <td className="p-3 font-mono">{(movement as any).consigneeMobile || linkedLr?.consigneeMobile || '-'}</td>
                              <td className="p-3 font-mono">{(movement as any).eWayBillNumber || '-'}</td>
                              <td className="p-3 font-mono">{(movement as any).eWayBillExpiryDate || '-'}</td>
                              <td className="p-3 font-mono">{(movement as any).reportingDate || '-'} {(movement as any).reportingTime || ''}</td>
                              <td className="p-3 font-mono">{movement.expectedArrivalDate || '-'} {movement.expectedArrivalTime || ''}</td>
                              <td className="p-3">
                                <button type="button" onClick={() => window.alert(`Movement: ${movement.movementNumber || (movement as any).movementId || movement.id}\nVehicle: ${movement.vehicleNumber || '-'}\nDriver: ${movement.driverName || '-'}\nRoute: ${(movement as any).routeDetails || movement.route || linkedLr?.routeDetails || '-'}`)} className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-bold">View</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredMovementHistory.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No movement records found.</div>}
                  </div>
                </div>
              )}

              {activeTab === 'drivers' && (
                <div className="space-y-6 text-left">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900">Driver Master</h2>
                      <p className="text-xs text-slate-500">Driver directory opens first; New Driver opens the existing onboard form.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setNewDriver({
                          name: '',
                          mobile: '',
                          alternateMobile: '',
                          address: '',
                          aadhaarNumber: '',
                          panNumber: '',
                          drivingLicenceNumber: '',
                          licenceExpiryDate: '',
                          joiningDate: new Date().toISOString().split('T')[0],
                          linkedVehicleId: '',
                          loginOtp: '',
                          otpActive: true
                        });
                        setShowAddDriver(true);
                      }}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-2 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      New Driver
                    </button>
                  </div>
                  <input type="text" value={driverListSearch} onChange={(e) => setDriverListSearch(e.target.value)} placeholder="Search by name, mobile, or license..." className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm" />
                  <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-3xl border border-slate-200 bg-white">
                    <table className="min-w-max text-left text-xs">
                      <thead className="text-[10px] font-black uppercase text-slate-500">
                        <tr>
                          <th className="p-3">Name</th>
                          <th className="p-3">Mobile</th>
                          <th className="p-3">DL No</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {drivers.filter(d => {
                          if (!driverListSearch.trim()) return true;
                          const q = driverListSearch.toLowerCase();
                          return [d.name, d.mobile, d.drivingLicenceNumber].some(v => (v || '').toLowerCase().includes(q));
                        }).map(d => {
                          const status = getDriverRecordStatus(d);
                          return (
                            <tr key={d.id} className="hover:bg-slate-50">
                              <td className="p-3 font-bold">{d.name}</td>
                              <td className="p-3 font-mono">{d.mobile}</td>
                              <td className="p-3">{d.drivingLicenceNumber || '-'}</td>
                              <td className="p-3">
                                <span className={`rounded-full px-2 py-1 text-[10px] font-black ${status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                  {status}
                                </span>
                              </td>
                              <td className="p-3">
                                <div className="flex flex-wrap gap-1.5">
                                  <button type="button" onClick={() => handleViewDriver(d)} className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-bold">View</button>
                                  <button type="button" onClick={() => openEditDriverFromList(d)} className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 font-bold">Edit</button>
                                  <button type="button" onClick={() => openEditDriverFromList(d)} className="px-2 py-1 rounded-full bg-sky-100 text-sky-700 font-bold">Update</button>
                                  {status !== 'Active' ? (
                                    <button type="button" onClick={() => handleActivateDriver(d.id)} className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-bold">Activate</button>
                                  ) : (
                                    <button type="button" onClick={() => handleDeactivateDriver(d.id)} className="px-2 py-1 rounded-full bg-rose-100 text-rose-700 font-bold">Deactivate</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'vehicles' && (
                <div className="space-y-6 text-left">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900">Vehicle Master</h2>
                      <p className="text-xs text-slate-500">Vehicle directory opens first; New Vehicle opens the existing vehicle form.</p>
                    </div>
                    <button type="button" onClick={() => setShowAddVehicle(true)} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-2 cursor-pointer">
                      <Plus className="w-4 h-4" />
                      New Vehicle
                    </button>
                  </div>
                  <input type="text" value={vehicleListSearch} onChange={(e) => setVehicleListSearch(e.target.value)} placeholder="Search by Vehicle Number, Driver Name, or Owner Name..." className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm" />
                  <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-3xl border border-slate-200 bg-white">
                    <table className="min-w-max text-left text-xs">
                      <thead className="text-[10px] font-black uppercase text-slate-500">
                        <tr>
                          <th className="p-3">Vehicle Number</th>
                          <th className="p-3">Driver</th>
                          <th className="p-3">Owner</th>
                          <th className="p-3">Type</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredVehicles.map(vehicle => {
                          const linkedDriver = drivers.find(d => d.id === vehicle.linkedDriverId || d.linkedVehicleNumber === vehicle.vehicleNumber);
                          const status = vehicle.recordStatus || 'Active';
                          const truckFlag = getVehicleDisplayStatus(vehicle);
                          return (
                            <tr key={vehicle.id} className="hover:bg-slate-50">
                              <td className="p-3 font-mono font-bold">{vehicle.vehicleNumber}</td>
                              <td className="p-3">{vehicle.linkedDriverName || linkedDriver?.name || '-'}</td>
                              <td className="p-3">{vehicle.ownerName || '-'}</td>
                              <td className="p-3">{vehicle.vehicleType || '-'}</td>
                              <td className="p-3">
                                <span className={truckFlagBadgeClassName} style={getTruckFlagStyle(truckFlag)}>
                                  {truckFlag}
                                </span>
                              </td>
                              <td className="p-3">
                                <div className="flex flex-wrap gap-1.5">
                                  <button type="button" onClick={() => handleViewVehicle(vehicle)} className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-bold">View</button>
                                  <button type="button" onClick={() => openEditVehicleFromList(vehicle)} className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 font-bold">Edit</button>
                                  {status !== 'Active' ? (
                                    <button type="button" onClick={() => handleActivateVehicle(vehicle.id)} className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-bold">Activate</button>
                                  ) : (
                                    <button type="button" onClick={() => handleDeactivateVehicle(vehicle.id)} className="px-2 py-1 rounded-full bg-rose-100 text-rose-700 font-bold">Deactivate</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'workshop' && (
                <div className="space-y-6 text-left">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900">Party Master</h2>
                      <p className="text-xs text-slate-500">Party list opens first; New Party opens the existing party form.</p>
                    </div>
                    <button type="button" onClick={() => { resetPartyForm(); setShowPartyMasterModal(true); }} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-2 cursor-pointer">
                      <Plus className="w-4 h-4" />
                      New Party
                    </button>
                  </div>
                  <input type="text" value={partySearchQuery} onChange={(e) => setPartySearchQuery(e.target.value)} placeholder="Search party name, city or mobile" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm" />
                  <div className="grid grid-cols-1 gap-3">
                    {partyMasters
                      .filter((p) => {
                        if (!partySearchQuery) return true;
                        const q = partySearchQuery.toLowerCase();
                        return p.partyName.toLowerCase().includes(q) || (p.mobileNumber || p.partyMobile || '').toLowerCase().includes(q) || (p.placeCity || '').toLowerCase().includes(q);
                      })
                      .map((p) => (
                        <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="text-xs font-black text-slate-900">{p.partyName}</div>
                              <div className="mt-1 text-[11px] text-slate-500">{p.partyType || 'CLIENT'} | {p.contactPerson || 'No contact'} | {p.mobileNumber || p.partyMobile || 'No mobile'}</div>
                              <div className="mt-1 text-[11px] text-slate-500">{p.placeCity || 'Unknown'}{p.state ? `, ${p.state}` : ''}</div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <button type="button" onClick={() => window.alert(`Party: ${p.partyName}\nContact: ${p.contactPerson || '-'}\nMobile: ${p.mobileNumber || p.partyMobile || '-'}\nCity: ${p.placeCity || '-'}`)} className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">View</button>
                              <button type="button" onClick={() => handleEditPartyMaster(p)} className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold">Edit</button>
                              <button type="button" onClick={() => handleDeletePartyMaster(p.id)} className="px-2 py-1 rounded-full bg-rose-100 text-rose-700 text-[11px] font-bold">Delete</button>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {activeTab === 'reports' && (
                <div className="space-y-6 text-left">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900">Route Master</h2>
                      <p className="text-xs text-slate-500">Saved routes open first; New Route opens the existing route form.</p>
                    </div>
                    <button type="button" onClick={() => { resetRouteForm(); setShowRouteMasterModal(true); }} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-2 cursor-pointer">
                      <Plus className="w-4 h-4" />
                      New Route
                    </button>
                  </div>
                  <input type="text" value={routeSearchQuery} onChange={(e) => setRouteSearchQuery(e.target.value)} placeholder="Search by city, code, or name..." className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm" />
                  <div className="grid grid-cols-1 gap-3">
                    {routeMasters
                      .filter((r) => {
                        if (!routeSearchQuery) return true;
                        const q = routeSearchQuery.toLowerCase();
                        return (r.routeName || '').toLowerCase().includes(q) || (r.routeCode || '').toLowerCase().includes(q) || (r.fromCity || r.loadingPoint || '').toLowerCase().includes(q) || (r.toCity || r.unloadingPoint || '').toLowerCase().includes(q);
                      })
                      .map((r, i) => (
                        <div key={r.id || `route-page-${i}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="text-xs font-black text-slate-900">{r.fromCity || r.loadingPoint} to {r.toCity || r.unloadingPoint}</div>
                              <div className="mt-1 text-[11px] text-slate-500">{r.routeCode || 'Uncoded'} | {r.distanceKm ? `${r.distanceKm} km` : 'Distance N/A'}</div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <button type="button" onClick={() => window.alert(`Route: ${r.routeName || '-'}\nFrom: ${r.fromCity || r.loadingPoint || '-'}\nTo: ${r.toCity || r.unloadingPoint || '-'}\nCode: ${r.routeCode || '-'}`)} className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">View</button>
                              <button type="button" onClick={() => handleEditRouteMaster(r)} className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold">Edit</button>
                              <button type="button" onClick={() => handleDeleteRouteMaster(r.id)} className="px-2 py-1 rounded-full bg-rose-100 text-rose-700 text-[11px] font-bold">Delete</button>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {activeTab === 'alerts' && (
                <div className="space-y-6 text-left">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900">Staff/User</h2>
                      <p className="text-xs text-slate-500">Operations username/password access for desktop staff. Stored under users/staff/accounts.</p>
                    </div>
                    <button type="button" onClick={resetStaffForm} disabled={currentStaff.role !== 'Admin'} className={`px-4 py-2.5 font-extrabold text-xs rounded-xl flex items-center gap-2 ${currentStaff.role === 'Admin' ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}>
                      <Plus className="w-4 h-4" />
                      New Staff/User
                    </button>
                  </div>
                  {currentStaff.role === 'Admin' ? (
                    <form onSubmit={handleSaveStaffUser} className="grid grid-cols-1 gap-4 rounded-3xl border border-slate-200 bg-white p-4 text-xs lg:grid-cols-5">
                      <div>
                        <label className="mb-1 block text-slate-500">Staff Name *</label>
                        <input value={staffForm.staffName} onChange={(e) => setStaffForm(prev => ({ ...prev, staffName: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white p-2.5" required />
                      </div>
                      <div>
                        <label className="mb-1 block text-slate-500">Username *</label>
                        <input value={staffForm.username} onChange={(e) => setStaffForm(prev => ({ ...prev, username: e.target.value.trim() }))} className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono" required />
                      </div>
                      <div>
                        <label className="mb-1 block text-slate-500">Password *</label>
                        <input type="text" value={staffForm.password} onChange={(e) => setStaffForm(prev => ({ ...prev, password: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono" required />
                      </div>
                      <div>
                        <label className="mb-1 block text-slate-500">Role *</label>
                        <select value={staffForm.role} onChange={(e) => setStaffForm(prev => ({ ...prev, role: e.target.value as OperationsStaffRole }))} className="w-full rounded-xl border border-slate-200 bg-white p-2.5">
                          {operationsStaffRoles.map(role => <option key={role} value={role}>{role}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-slate-500">Status *</label>
                        <select value={staffForm.status} onChange={(e) => setStaffForm(prev => ({ ...prev, status: e.target.value as 'Active' | 'Inactive' }))} className="w-full rounded-xl border border-slate-200 bg-white p-2.5">
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      </div>
                      <div className="lg:col-span-5 flex justify-end gap-2 border-t border-slate-100 pt-3">
                        <button type="button" onClick={resetStaffForm} className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700">Reset</button>
                        <button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2 font-black text-white hover:bg-indigo-700">
                          {editingStaffId ? 'Update Staff/User' : 'Create Staff/User'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                      Only Admin can create, update, activate, or deactivate Staff/User records.
                    </div>
                  )}

                  <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-3xl border border-slate-200 bg-white">
                    <table className="min-w-[900px] w-full text-left text-xs">
                      <thead className="text-[10px] font-black uppercase text-slate-500">
                        <tr>
                          <th className="p-3">Staff Name</th>
                          <th className="p-3">Username</th>
                          <th className="p-3">Password</th>
                          <th className="p-3">Role</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {staffUsers.map(staff => (
                          <tr key={staff.id} className="hover:bg-slate-50">
                            <td className="p-3 font-bold text-slate-900">{staff.staffName}</td>
                            <td className="p-3 font-mono">{staff.username}</td>
                            <td className="p-3 font-mono">{staff.password}</td>
                            <td className="p-3">{staff.role}</td>
                            <td className="p-3">
                              <span className={`rounded-full px-2 py-1 text-[10px] font-black ${staff.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                {staff.status}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="flex flex-wrap gap-1.5">
                                <button type="button" onClick={() => handleEditStaffUser(staff)} disabled={currentStaff.role !== 'Admin'} className="rounded-full bg-indigo-100 px-2 py-1 font-bold text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">Edit</button>
                                <button type="button" onClick={() => handleToggleStaffStatus(staff)} disabled={currentStaff.role !== 'Admin'} className="rounded-full bg-slate-100 px-2 py-1 font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
                                  {staff.status === 'Active' ? 'Inactive' : 'Activate'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {staffUsers.length === 0 && (
                      <div className="p-8 text-center text-sm text-slate-500">No Staff/User records found.</div>
                    )}
                  </div>
                </div>
              )}

            </>
          )}
          </div>

          {/* Quick-Access Forms / Operations Sidebar (Right Column) */}
          {false && showSidebar && (
            <div className="lg:col-span-1 space-y-6 animate-fadeIn">
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-5 text-left">
              <div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
                  <span>{languageMode === 'hindi' ? 'प्रशासनिक प्रपत्र' : 'ADMINISTRATIVE FORMS'}</span>
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">
                  {languageMode === 'hindi' 
                    ? 'त्वरित असाइनमेंट, बुकिंग और डेटा प्रबंधन प्रपत्र यहां से सीधे संचालित करें।'
                    : 'Directly access and launch fast setup logs and master directories from any tab.'}
                </p>
              </div>

              {/* QUICK LAUNCH GRID FOR ALL APP CREATIVE FORMS */}
              <div className="space-y-3">
                
                {/* FORM 1: LOADING CONFIRMATION */}
                <button
                  type="button"
                  onClick={() => setShowAddLoading(true)}
                  className="w-full p-3.5 bg-amber-50 border border-amber-100 hover:bg-amber-100/60 hover:border-amber-200 text-amber-950 rounded-2xl flex items-start gap-3 transition-all cursor-pointer group text-left"
                >
                  <span className="p-2 bg-white rounded-lg text-amber-600 border border-amber-100 group-hover:scale-110 transition-transform">
                    <Layers className="w-4 h-4" />
                  </span>
                  <div>
                    <strong className="text-xs font-black block group-hover:text-amber-850 transition-colors">
                      {languageMode === 'hindi' ? 'लोडिंग पुष्टीकरण प्रबंधन' : '⚓ Loading Confirmation Form'}
                    </strong>
                    <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">
                      {languageMode === 'hindi' ? 'वाहन के लिए लोडिंग रसीद जारी करें' : 'Verify loaded cargo, weights & checkpoint'}
                    </span>
                  </div>
                </button>

                {/* FORM 2: CONSIGNMENT LR */}
                <button
                  type="button"
                  onClick={() => setShowAddConsignment(true)}
                  className="w-full p-3.5 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100/60 hover:border-indigo-200 text-indigo-950 rounded-2xl flex items-start gap-3 transition-all cursor-pointer group text-left"
                >
                  <span className="p-2 bg-white rounded-lg text-indigo-600 border border-indigo-100 group-hover:scale-110 transition-transform">
                    <ClipboardList className="w-4 h-4" />
                  </span>
                  <div>
                    <strong className="text-xs font-black block group-hover:text-indigo-600 transition-colors">
                      {languageMode === 'hindi' ? 'नया एलआर बुकिंग (LR)' : '📝 Book New Consignment Bill'}
                    </strong>
                    <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">
                      {languageMode === 'hindi' ? 'माल ढुलाई रसीद और माल दर्ज करें' : 'Record freight receipt, goods and routes'}
                    </span>
                  </div>
                </button>

                {/* FORM 3: MOVEMENT CREATE */}
                <button
                  type="button"
                  onClick={() => setShowAddMovement(true)}
                  className="w-full p-3.5 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100/60 hover:border-emerald-250 text-emerald-950 rounded-2xl flex items-start gap-3 transition-all cursor-pointer group text-left"
                >
                  <span className="p-2 bg-white rounded-lg text-emerald-600 border border-emerald-100 group-hover:scale-110 transition-transform">
                    <Truck className="w-4 h-4" />
                  </span>
                  <div>
                    <strong className="text-xs font-black block group-hover:text-emerald-700 transition-colors">
                      {languageMode === 'hindi' ? 'आंदोलन बनाएँ' : '🚛 Movement Create'}
                    </strong>
                    <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">
                      {languageMode === 'hindi' ? 'वाहन और ड्राइवर को ट्रिप लोड सौंपें' : 'Allocate vehicle and driver to a active run'}
                    </span>
                  </div>
                </button>

                {/* FORM 4: ADD DRIVER */}
                <button
                  type="button"
                  onClick={() => setShowAddDriver(true)}
                  className="w-full p-3.5 bg-sky-50 border border-sky-100 hover:bg-sky-100/60 hover:border-sky-200 text-sky-950 rounded-2xl flex items-start gap-3 transition-all cursor-pointer group text-left"
                >
                  <span className="p-2 bg-white rounded-lg text-sky-600 border border-sky-100 group-hover:scale-110 transition-transform">
                    <Users className="w-4 h-4" />
                  </span>
                  <div>
                    <strong className="text-xs font-black block group-hover:text-sky-700 transition-colors">
                      {languageMode === 'hindi' ? 'नया ड्राइवर ऑनबोर्ड करें' : '👤 Driver Master'}
                    </strong>
                    <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">
                      {languageMode === 'hindi' ? 'लाइसेंस एवं संपर्क विवरण दर्ज करें' : 'Register license, phone & start profile'}
                    </span>
                  </div>
                </button>

                {/* FORM 5: ADD VEHICLE */}
                <button
                  type="button"
                  onClick={() => setShowAddVehicle(true)}
                  className="w-full p-3.5 bg-rose-50 border border-rose-100 hover:bg-rose-100/60 hover:border-rose-200 text-rose-950 rounded-2xl flex items-start gap-3 transition-all cursor-pointer group text-left"
                >
                  <span className="p-2 bg-white rounded-lg text-rose-600 border border-rose-100 group-hover:scale-110 transition-transform">
                    <Calendar className="w-4 h-4" />
                  </span>
                  <div>
                    <strong className="text-xs font-black block group-hover:text-rose-700 transition-colors">
                      {languageMode === 'hindi' ? 'नया वाहन पंजीकृत करें' : '🚗 Vehicle Master'}
                    </strong>
                    <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">
                      {languageMode === 'hindi' ? 'नंबर प्लेट और पहिया एक्सल जोड़ें' : 'Input plates, visual axles & initial tags'}
                    </span>
                  </div>
                </button>

                {/* FORM 6: PARTY MASTER */}
                <button
                  type="button"
                  onClick={() => { setShowPartyMasterModal(true); resetPartyForm(); }}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 hover:bg-slate-100/80 hover:border-slate-300 text-slate-950 rounded-2xl flex items-start gap-3 transition-all cursor-pointer group text-left"
                >
                  <span className="p-2 bg-white rounded-lg text-slate-700 border border-slate-200 group-hover:scale-110 transition-transform">
                    <Users className="w-4 h-4" />
                  </span>
                  <div>
                    <strong className="text-xs font-black block group-hover:text-slate-900 transition-colors">
                      {languageMode === 'hindi' ? 'पार्टी मास्टर' : '👥 Party Master'}
                    </strong>
                    <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">
                      {languageMode === 'hindi' ? 'ग्राहक व दलाल प्रोफ़ाइल बनाएँ' : 'Create customer and broker profiles with courier tracking'}
                    </span>
                  </div>
                </button>

                {/* FORM 7: ROUTE MASTER */}
                <button
                  type="button"
                  onClick={() => { setShowRouteMasterModal(true); resetRouteForm(); }}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 hover:bg-slate-100/80 hover:border-slate-300 text-slate-950 rounded-2xl flex items-start gap-3 transition-all cursor-pointer group text-left"
                >
                  <span className="p-2 bg-white rounded-lg text-slate-700 border border-slate-200 group-hover:scale-110 transition-transform">
                    <MapPin className="w-4 h-4" />
                  </span>
                  <div>
                    <strong className="text-xs font-black block group-hover:text-slate-900 transition-colors">
                      {languageMode === 'hindi' ? 'रूट मास्टर' : '🛣️ Route Master'}
                    </strong>
                    <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">
                      {languageMode === 'hindi' ? 'मानक मार्ग और ट्रांज़िट दिन प्रबंधित करें' : 'Manage standard routes and transit days'}
                    </span>
                  </div>
                </button>

              </div>

              {/* LIVE SYNCING STATUS MODULE */}
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-bold">{languageMode === 'hindi' ? 'डेटाबेस सिंक स्थिति' : 'Sync Engine State'}</span>
                  <span className="flex items-center gap-1 text-emerald-600 font-extrabold font-mono text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                    <span>ONLINE (FIRESTORE)</span>
                  </span>
                </div>
                
                {/* Quick stats board */}
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="bg-slate-50 border border-slate-200/50 p-2 rounded-xl text-center">
                    <span className="text-slate-400 block font-bold uppercase text-[8px] tracking-wide">
                      {languageMode === 'hindi' ? 'ड्राइवर संख्या' : 'Drivers'}
                    </span>
                    <strong className="text-slate-705 text-xs font-bold font-mono">{drivers.length}</strong>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/50 p-2 rounded-xl text-center">
                    <span className="text-slate-400 block font-bold uppercase text-[8px] tracking-wide">
                      {languageMode === 'hindi' ? 'असाइन ट्रिप्स' : 'Active Trips'}
                    </span>
                    <strong className="text-slate-705 text-xs font-bold font-mono">
                      {trips.filter(t => t.status !== 'completed').length}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* QUICK USE TIPS BOX */}
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 text-white p-5 rounded-3xl shadow-sm text-left relative overflow-hidden">
              <div className="absolute right-0 bottom-0 opacity-10 font-black text-7xl select-none rotate-12">DNK</div>
              <h4 className="text-xs font-black uppercase tracking-wider">{languageMode === 'hindi' ? 'उपयोग युक्ति' : 'Quick Operators Tip'}</h4>
              <p className="text-[10px] text-indigo-50 leading-relaxed mt-2">
                {languageMode === 'hindi' 
                  ? 'सैंडबॉक्स मोड में लाइव परीक्षण करने के लिए किसी भी समय "SEED DEMO" बटन दबाएं ताकि सभी प्रणालियों में डमी लोड सक्रिय हो जाये।'
                  : 'Click the "SEED DEMO" button at the top header to instantly fill all drivers and trips to trial dispatch lifecycles.'}
              </p>
            </div>
          </div>
          )}

        </div>
      </section>

      {/* ==================== CREATE DRIVER FORM DIALOG SHEET ==================== */}
      {showAddDriver && (
        <div className="fixed inset-0 bg-slate-50 z-50 overflow-y-auto text-slate-800">
          <div className="w-full min-w-0 min-h-screen px-6 py-5 text-left flex flex-col">
            <h3 className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur text-lg font-black text-slate-900 border-b border-slate-200 py-4 block">Driver Master</h3>
            <form onSubmit={handleCreateDriver} className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 py-6 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Driver Name *</label>
                  <input
                    type="text"
                    required
                    value={newDriver.name}
                    onChange={(e) => setNewDriver(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Sohan Singh"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Mobile Contact *</label>
                  <input
                    type="tel"
                    maxLength={10}
                    required
                    value={newDriver.mobile}
                    onChange={(e) => setNewDriver(prev => ({ ...prev, mobile: e.target.value.replace(/\D/g, '') }))}
                    placeholder="9999912345"
                    className="w-full font-mono bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Driver Login OTP *</label>
                  <input
                    type="text"
                    required
                    value={newDriver.loginOtp}
                    onChange={(e) => setNewDriver(prev => ({ ...prev, loginOtp: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                    placeholder="1234"
                    className="w-full font-mono bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-600">
                  <input
                    type="checkbox"
                    checked={newDriver.otpActive}
                    onChange={(e) => setNewDriver(prev => ({ ...prev, otpActive: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  OTP Active
                </label>
              </div>

              <div>
                <label className="text-slate-500 font-bold block mb-1">Residential Address</label>
                <input
                  type="text"
                  value={newDriver.address}
                  onChange={(e) => setNewDriver(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Plot 4, Gali No. 2, Rohini Sector 1, New Delhi"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Aadhaar Card No</label>
                  <input
                    type="text"
                    value={newDriver.aadhaarNumber}
                    onChange={(e) => setNewDriver(prev => ({ ...prev, aadhaarNumber: e.target.value }))}
                    placeholder="1234-5678-9999"
                    className="w-full font-mono bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">PAN Card No</label>
                  <input
                    type="text"
                    value={newDriver.panNumber}
                    onChange={(e) => setNewDriver(prev => ({ ...prev, panNumber: e.target.value }))}
                    placeholder="ABCDE1234F"
                    className="w-full font-mono bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Driving License (DL) No</label>
                  <input
                    type="text"
                    value={newDriver.drivingLicenceNumber}
                    onChange={(e) => setNewDriver(prev => ({ ...prev, drivingLicenceNumber: e.target.value }))}
                    placeholder="DL-14201093348"
                    className="w-full font-mono bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">DL Expiry Date</label>
                  <input
                    type="date"
                    value={newDriver.licenceExpiryDate}
                    onChange={(e) => setNewDriver(prev => ({ ...prev, licenceExpiryDate: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-500 font-bold block mb-1">🔗 Link Regular Truck / नियमित ट्रक लिंक करें (Optional)</label>
                <select
                  value={newDriver.linkedVehicleId}
                  onChange={(e) => setNewDriver(prev => ({ ...prev, linkedVehicleId: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                >
                  <option value="">-- No Regular Truck / कोई ट्रक लिंक नहीं --</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.vehicleNumber} ({v.vehicleType})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  * Regularly driving the same truck? Setting this links them together and pre-fills them during trip assignments!
                </p>
              </div>

              <div className="lg:col-span-2 xl:col-span-3 sticky bottom-0 z-20 -mx-6 flex gap-2 justify-end px-6 py-4 border-t border-slate-200 bg-slate-50/95 backdrop-blur">
                <button
                  type="button"
                  onClick={() => setShowAddDriver(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg cursor-pointer text-xs"
                >
                  Save Driver
                </button>
              </div>
            </form>
            {/* Driver Directory (searchable) */}
            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h4 className="text-sm font-black text-slate-900">Driver Directory</h4>
                  <p className="text-[11px] text-slate-500">Search and manage all drivers from the drivers collection.</p>
                </div>
                <div className="text-xs text-slate-500 font-semibold">Total: {drivers.length}</div>
              </div>
              <div className="mb-4">
                <input
                  type="text"
                  value={driverListSearch}
                  onChange={(e) => setDriverListSearch(e.target.value)}
                  placeholder="Search by name, mobile, or license..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400"
                />
              </div>
              <div className="w-full min-w-0 max-w-full overflow-x-auto border border-slate-200 rounded-2xl bg-white">
                <table className="min-w-max text-left border-collapse text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-100">
                    <tr>
                      <th className="p-2">Name</th>
                      <th className="p-2">Mobile</th>
                      <th className="p-2">DL No</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                    {drivers.filter(d => {
                      if (!driverListSearch.trim()) return true;
                      const q = driverListSearch.toLowerCase();
                      return [d.name, d.mobile, d.drivingLicenceNumber].some(v => (v || '').toLowerCase().includes(q));
                    }).map(d => {
                      const status = getDriverRecordStatus(d);
                      return (
                        <tr key={d.id} className="hover:bg-slate-50/75 transition-colors">
                          <td className="p-2 font-bold">{d.name}</td>
                          <td className="p-2 font-mono">{d.mobile}</td>
                          <td className="p-2">{d.drivingLicenceNumber || '—'}</td>
                          <td className="p-2">
                            <span className={`rounded-full px-2 py-1 text-[10px] font-black ${status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                              {status}
                            </span>
                          </td>
                          <td className="p-2">
                            <div className="flex gap-2">
                              <button type="button" onClick={() => handleViewDriver(d)} className="px-2 py-1 bg-slate-100 rounded text-[11px]">View</button>
                              <button type="button" onClick={() => openEditDriverFromList(d)} className="px-2 py-1 bg-indigo-100 rounded text-[11px]">Edit</button>
                              <button type="button" onClick={() => openEditDriverFromList(d)} className="px-2 py-1 bg-sky-100 rounded text-[11px]">Update</button>
                              {status !== 'Active' ? (
                                <button type="button" onClick={() => handleActivateDriver(d.id)} className="px-2 py-1 bg-emerald-100 rounded text-[11px]">Activate</button>
                              ) : (
                                <button type="button" onClick={() => handleDeactivateDriver(d.id)} className="px-2 py-1 bg-rose-100 rounded text-[11px]">Deactivate</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== CREATE VEHICLE FORM DIALOG SHEET ==================== */}
      {showAddVehicle && (
        <div className="fixed inset-0 bg-slate-50 z-50 overflow-y-auto text-slate-800">
          <div className="w-full min-w-0 min-h-screen px-6 py-5 text-left flex flex-col">
            <h3 className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur text-lg font-black text-slate-900 border-b border-slate-200 py-4 block">Vehicle Master</h3>
            <form onSubmit={handleCreateVehicle} className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 py-6 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Vehicle Reg Number *</label>
                  <input
                    type="text"
                    required
                    value={newVehicle.vehicleNumber}
                    onChange={(e) => setNewVehicle(prev => ({ ...prev, vehicleNumber: e.target.value.toUpperCase() }))}
                    placeholder="UP-16-T-9000"
                    className="w-full font-mono bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Ownership Type</label>
                  <select
                    value={newVehicle.ownershipType}
                    onChange={(e) => setNewVehicle(prev => ({ ...prev, ownershipType: e.target.value as any }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  >
                    <option value="owned">Owned Fleet (DNK)</option>
                    <option value="attached">Attached Private Sublease</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Body Truck Type</label>
                  <input
                    type="text"
                    value={newVehicle.vehicleType}
                    onChange={(e) => setNewVehicle(prev => ({ ...prev, vehicleType: e.target.value }))}
                    placeholder="HCV Multi-axle Heavy Truck"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Tonnage Payload Capacity</label>
                  <input
                    type="text"
                    value={newVehicle.capacity}
                    onChange={(e) => setNewVehicle(prev => ({ ...prev, capacity: e.target.value }))}
                    placeholder="24 Tons"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Owner Full Name</label>
                  <input
                    type="text"
                    value={newVehicle.ownerName}
                    onChange={(e) => setNewVehicle(prev => ({ ...prev, ownerName: e.target.value }))}
                    placeholder="Sher Singh Transport"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Owner Contact Phone</label>
                  <input
                    type="tel"
                    value={newVehicle.ownerMobile}
                    onChange={(e) => setNewVehicle(prev => ({ ...prev, ownerMobile: e.target.value.replace(/\D/g, '') }))}
                    placeholder="9876501234"
                    className="w-full font-mono bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-500 font-bold block mb-1">🔗 Link Regular Driver / नियमित ड्राइवर लिंक करें (Optional)</label>
                <select
                  value={newVehicle.linkedDriverId}
                  onChange={(e) => setNewVehicle(prev => ({ ...prev, linkedDriverId: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                >
                  <option value="">-- No Regular Driver / कोई ड्राइवर लिंक नहीं --</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.driverCode})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  * Regularly driving the same truck? Setting this links them together and pre-fills them during trip assignments!
                </p>
              </div>

              {/* Compliance Expiries panel */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[9px] font-bold text-slate-600 block uppercase tracking-wider">Compliance Expiry Tracking Calendar</span>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <label className="text-slate-500 font-bold block mb-0.5">Insurance Expiry Date</label>
                    <input
                      type="date"
                      value={newVehicle.insuranceExpiry}
                      onChange={(e) => setNewVehicle(prev => ({ ...prev, insuranceExpiry: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded p-1 text-[10px] text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 font-bold block mb-0.5">Fitness Certificate Expiry</label>
                    <input
                      type="date"
                      value={newVehicle.fitnessExpiry}
                      onChange={(e) => setNewVehicle(prev => ({ ...prev, fitnessExpiry: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded p-1 text-[10px] text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 font-bold block mb-0.5">Permit Expiry Date</label>
                    <input
                      type="date"
                      value={newVehicle.permitExpiry}
                      onChange={(e) => setNewVehicle(prev => ({ ...prev, permitExpiry: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded p-1 text-[10px] text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 font-bold block mb-0.5">Pollution PUC Expiry</label>
                    <input
                      type="date"
                      value={newVehicle.pucExpiry}
                      onChange={(e) => setNewVehicle(prev => ({ ...prev, pucExpiry: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded p-1 text-[10px] text-slate-800"
                    />
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2 xl:col-span-3 sticky bottom-0 z-20 -mx-6 flex gap-2 justify-end px-6 py-4 border-t border-slate-200 bg-slate-50/95 backdrop-blur">
                <button
                  type="button"
                  onClick={() => setShowAddVehicle(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg cursor-pointer text-xs"
                >
                  Save Vehicle
                </button>
              </div>
            </form>

            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h4 className="text-sm font-black text-slate-900">Vehicle Directory</h4>
                  <p className="text-[11px] text-slate-500">Search and manage all trucks from the vehicles collection.</p>
                </div>
                <div className="text-xs text-slate-500 font-semibold">
                  Showing {filteredVehicles.length} of {vehicles.length}
                </div>
              </div>

              <div className="mb-4">
                <input
                  type="text"
                  value={vehicleListSearch}
                  onChange={(e) => setVehicleListSearch(e.target.value)}
                  placeholder="Search by Vehicle Number, Driver Name, or Owner Name..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400"
                />
              </div>

              <div className="w-full min-w-0 max-w-full overflow-x-auto border border-slate-200 rounded-2xl bg-white">
                <table className="min-w-max text-left border-collapse text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-100">
                    <tr>
                      <th className="p-3">Vehicle Number</th>
                      <th className="p-3">Driver Name</th>
                      <th className="p-3">Owner Name</th>
                      <th className="p-3">Type / Capacity</th>
                      <th className="p-3">Record Status</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                    {filteredVehicles.map((vehicle) => {
                      const linkedDriver = drivers.find(d => d.id === vehicle.linkedDriverId || d.linkedVehicleNumber === vehicle.vehicleNumber);
                      const recordStatus = vehicle.recordStatus || 'Active';
                      const truckFlag = getVehicleDisplayStatus(vehicle);
                      return (
                        <tr key={vehicle.id} className="hover:bg-slate-50/75 transition-colors">
                          <td className="p-3">
                            <div className="font-mono font-bold text-slate-900">{vehicle.vehicleNumber}</div>
                            <span className={`${truckFlagBadgeClassName} mt-1`} style={getTruckFlagStyle(truckFlag)}>
                              {truckFlag}
                            </span>
                          </td>
                          <td className="p-3">{vehicle.linkedDriverName || linkedDriver?.name || 'N/A'}</td>
                          <td className="p-3">{vehicle.ownerName || 'N/A'}</td>
                          <td className="p-3">
                            <div className="font-semibold">{vehicle.vehicleType || 'N/A'}</div>
                            <div className="text-[10px] text-slate-400">{vehicle.capacity || 'N/A'}</div>
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-bold ${
                              recordStatus === 'Active'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}>
                              {recordStatus}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleViewVehicle(vehicle)}
                                className="px-2 py-1 text-[10px] font-bold rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                              >
                                View
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditVehicleFromList(vehicle)}
                                className="px-2 py-1 text-[10px] font-bold rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditVehicleFromList(vehicle)}
                                className="px-2 py-1 text-[10px] font-bold rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200"
                              >
                                Update
                              </button>
                              <button
                                type="button"
                                onClick={() => handleActivateVehicle(vehicle.id)}
                                disabled={recordStatus === 'Active'}
                                className="px-2 py-1 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                Activate
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeactivateVehicle(vehicle.id)}
                                disabled={recordStatus === 'Inactive'}
                                className="px-2 py-1 text-[10px] font-bold rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                Deactivate
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredVehicles.length === 0 && (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No vehicles match your search.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== PARTY MASTER MODULE DIALOG SHEET ==================== */}
      {showPartyMasterModal && (
        <div className="fixed inset-0 bg-slate-50 z-50 overflow-y-auto text-slate-800">
          <div className="w-full min-w-0 min-h-screen px-6 py-5 text-left flex flex-col">
            <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur flex flex-col lg:flex-row lg:items-start gap-4 justify-between border-b border-slate-200 py-4 mb-4">
              <div>
                <h3 className="text-base font-black text-slate-900">👥 Party Master</h3>
                <p className="text-[11px] text-slate-500 mt-1">Create, edit and track customer and broker party profiles with courier tracking.</p>
              </div>
              <button
                type="button"
                onClick={() => { setShowPartyMasterModal(false); resetPartyForm(); }}
                className="px-3 py-2 text-slate-600 bg-slate-100 rounded-xl font-bold text-xs"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-5">
              <div className="bg-slate-50 rounded-3xl border border-slate-200 p-5 space-y-4">
                <h4 className="text-sm font-black text-slate-900">Party Profile</h4>
                <form onSubmit={handleSavePartyMaster} className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-500 font-bold block mb-1">Party Name *</label>
                      <input
                        type="text"
                        required
                        value={partyForm.partyName}
                        onChange={(e) => setPartyForm(prev => ({ ...prev, partyName: e.target.value }))}
                        placeholder="e.g. UltraTech Cement Corp"
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 font-bold block mb-1">Party Type *</label>
                      <select
                        required
                        value={partyForm.partyType}
                        onChange={(e) => setPartyForm(prev => ({ ...prev, partyType: e.target.value as 'CLIENT' | 'BROKER' }))}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      >
                        <option value="CLIENT">CLIENT</option>
                        <option value="BROKER">BROKER</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-500 font-bold block mb-1">Place / City *</label>
                      <input
                        type="text"
                        required
                        value={partyForm.placeCity}
                        onChange={(e) => setPartyForm(prev => ({ ...prev, placeCity: e.target.value }))}
                        placeholder="e.g. Gurugram"
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 font-bold block mb-1">State (Optional)</label>
                      <input
                        type="text"
                        value={partyForm.state}
                        onChange={(e) => setPartyForm(prev => ({ ...prev, state: e.target.value }))}
                        placeholder="e.g. Haryana"
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-500 font-bold block mb-1">Broker</label>
                      <input
                        type="text"
                        value={partyForm.broker}
                        onChange={(e) => setPartyForm(prev => ({ ...prev, broker: e.target.value }))}
                        placeholder="Broker or agency name"
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 font-bold block mb-1">Contact Person</label>
                      <input
                        type="text"
                        required
                        value={partyForm.contactPerson}
                        onChange={(e) => setPartyForm(prev => ({ ...prev, contactPerson: e.target.value }))}
                        placeholder="Primary contact person"
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-500 font-bold block mb-1">Mobile Number</label>
                      <input
                        type="tel"
                        required
                        value={partyForm.mobileNumber}
                        onChange={(e) => setPartyForm(prev => ({ ...prev, mobileNumber: e.target.value.replace(/\D/g, '') }))}
                        placeholder="9876501234"
                        className="w-full font-mono bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 font-bold block mb-1">Alternate Mobile Number</label>
                      <input
                        type="tel"
                        value={partyForm.alternateMobileNumber}
                        onChange={(e) => setPartyForm(prev => ({ ...prev, alternateMobileNumber: e.target.value.replace(/\D/g, '') }))}
                        placeholder="Optional second contact"
                        className="w-full font-mono bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-500 font-bold block mb-1">Email</label>
                      <input
                        type="email"
                        value={partyForm.email}
                        onChange={(e) => setPartyForm(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="contact@example.com"
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 font-bold block mb-1">GST Number</label>
                      <input
                        type="text"
                        value={partyForm.gstNumber}
                        onChange={(e) => setPartyForm(prev => ({ ...prev, gstNumber: e.target.value }))}
                        placeholder="07AAACL1234A1Z9"
                        className="w-full font-mono bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-500 font-bold block mb-1">PAN Number</label>
                      <input
                        type="text"
                        value={partyForm.panNumber}
                        onChange={(e) => setPartyForm(prev => ({ ...prev, panNumber: e.target.value }))}
                        placeholder="ABCDE1234F"
                        className="w-full font-mono bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 font-bold block mb-1">Status</label>
                      <select
                        value={partyForm.status}
                        onChange={(e) => setPartyForm(prev => ({ ...prev, status: e.target.value as 'ACTIVE' | 'INACTIVE' | 'BLACKLISTED' }))}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="INACTIVE">INACTIVE</option>
                        <option value="BLACKLISTED">BLACKLISTED</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-500 font-bold block mb-1">Billing Address</label>
                    <textarea
                      value={partyForm.billingAddress}
                      onChange={(e) => setPartyForm(prev => ({ ...prev, billingAddress: e.target.value }))}
                      rows={3}
                      placeholder="Billing address for invoices"
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <label className="text-slate-500 font-bold block mb-1">Additional Contact Persons</label>
                        <p className="text-[10px] text-slate-400">Add secondary contacts for this party.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddPartyContactRow}
                        className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100"
                      >
                        + Add Row
                      </button>
                    </div>
                    <div className="space-y-3">
                      {partyForm.additionalContacts.map((contact, index) => (
                        <div key={contact.id} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <input
                            type="text"
                            value={contact.name}
                            onChange={(e) => handleUpdatePartyContact(index, 'name', e.target.value)}
                            placeholder="Contact Person Name"
                            className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                          />
                          <input
                            type="tel"
                            value={contact.mobile}
                            onChange={(e) => handleUpdatePartyContact(index, 'mobile', e.target.value.replace(/\D/g, ''))}
                            placeholder="Mobile Number"
                            className="w-full font-mono bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                          />
                          <input
                            type="email"
                            value={contact.email}
                            onChange={(e) => handleUpdatePartyContact(index, 'email', e.target.value)}
                            placeholder="Email"
                            className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-100 rounded-3xl border border-slate-200 p-4 space-y-3">
                    <h4 className="text-sm font-black text-slate-900">Document / Courier Tracking</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-500 font-bold block mb-1">Document Sent</label>
                        <div className="flex items-center gap-3">
                          <label className="text-xs text-slate-600 flex items-center gap-1">
                            <input
                              type="radio"
                              name="documentsSent"
                              value="Yes"
                              checked={partyForm.documentsSent === 'Yes'}
                              onChange={() => setPartyForm(prev => ({ ...prev, documentsSent: 'Yes' }))}
                              className="accent-indigo-600"
                            />
                            Yes
                          </label>
                          <label className="text-xs text-slate-600 flex items-center gap-1">
                            <input
                              type="radio"
                              name="documentsSent"
                              value="No"
                              checked={partyForm.documentsSent === 'No'}
                              onChange={() => setPartyForm(prev => ({ ...prev, documentsSent: 'No' }))}
                              className="accent-indigo-600"
                            />
                            No
                          </label>
                        </div>
                      </div>
                      <div>
                        <label className="text-slate-500 font-bold block mb-1">Courier Company</label>
                        <input
                          type="text"
                          value={partyForm.courierCompany}
                          onChange={(e) => setPartyForm(prev => ({ ...prev, courierCompany: e.target.value }))}
                          placeholder="e.g. Blue Dart"
                          className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={partyForm.docketNumber}
                        onChange={(e) => setPartyForm(prev => ({ ...prev, docketNumber: e.target.value }))}
                        placeholder="Docket Number"
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      />
                      <input
                        type="date"
                        value={partyForm.dispatchDate}
                        onChange={(e) => setPartyForm(prev => ({ ...prev, dispatchDate: e.target.value }))}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={partyForm.sentBy}
                        onChange={(e) => setPartyForm(prev => ({ ...prev, sentBy: e.target.value }))}
                        placeholder="Sent By"
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      />
                      <input
                        type="text"
                        value={partyForm.receiverName}
                        onChange={(e) => setPartyForm(prev => ({ ...prev, receiverName: e.target.value }))}
                        placeholder="Receiver Name"
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="date"
                        value={partyForm.receivedDate}
                        onChange={(e) => setPartyForm(prev => ({ ...prev, receivedDate: e.target.value }))}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      />
                      <input
                        type="time"
                        value={partyForm.receivedTime}
                        onChange={(e) => setPartyForm(prev => ({ ...prev, receivedTime: e.target.value }))}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      />
                    </div>
                    <textarea
                      value={partyForm.remarks}
                      onChange={(e) => setPartyForm(prev => ({ ...prev, remarks: e.target.value }))}
                      rows={3}
                      placeholder="Remarks"
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                    />
                  </div>

                  <div className="sticky bottom-0 z-20 -mx-5 flex flex-col sm:flex-row gap-3 justify-end px-5 py-4 border-t border-slate-200 bg-slate-50/95 backdrop-blur">
                    <button
                      type="button"
                      onClick={() => { resetPartyForm(); setShowPartyMasterModal(false); }}
                      className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg text-xs"
                    >
                      {editingParty ? 'Update Party' : 'Create Party'}
                    </button>
                  </div>
                </form>
              </div>

              <div className="space-y-4">
                <div className="bg-white rounded-3xl border border-slate-200 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                    <div>
                      <h4 className="text-sm font-black text-slate-900">Party Registry</h4>
                      <p className="text-[10px] text-slate-500">Filter and edit party records.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <select
                        value={partyPlaceFilter}
                        onChange={(e) => setPartyPlaceFilter(e.target.value as any)}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      >
                        <option value="ALL">All Places</option>
                        {Array.from(new Set(partyMasters.map((p) => (p.placeCity || '').trim()).filter(Boolean))).map((place) => (
                          <option key={place} value={place}>{place}</option>
                        ))}
                      </select>
                      <select
                        value={partyTypeFilter}
                        onChange={(e) => setPartyTypeFilter(e.target.value as any)}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      >
                        <option value="ALL">All Types</option>
                        <option value="CLIENT">CLIENT</option>
                        <option value="BROKER">BROKER</option>
                      </select>
                      <select
                        value={partyStatusFilter}
                        onChange={(e) => setPartyStatusFilter(e.target.value as any)}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      >
                        <option value="ALL">All Statuses</option>
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="INACTIVE">INACTIVE</option>
                        <option value="BLACKLISTED">BLACKLISTED</option>
                      </select>
                      <input
                        type="text"
                        value={partySearchQuery}
                        onChange={(e) => setPartySearchQuery(e.target.value)}
                        placeholder="Search party name, city or mobile"
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    {partyMasters
                      .filter((p) => partyTypeFilter === 'ALL' || ((p.partyType || '').toString().toUpperCase() === partyTypeFilter))
                      .filter((p) => partyPlaceFilter === 'ALL' || (p.placeCity || '').toString().toLowerCase() === partyPlaceFilter.toString().toLowerCase())
                      .filter((p) => partyStatusFilter === 'ALL' || (p.status || 'ACTIVE') === partyStatusFilter)
                      .filter((p) => {
                        if (!partySearchQuery) return true;
                        const q = partySearchQuery.toLowerCase();
                        return p.partyName.toLowerCase().includes(q) ||
                          (p.mobileNumber || p.partyMobile || '').toLowerCase().includes(q) ||
                          (p.placeCity || '').toLowerCase().includes(q) ||
                          (p.state || '').toLowerCase().includes(q) ||
                          (p.partyType || '').toLowerCase().includes(q);
                      })
                      .map((p) => (
                        <div key={p.id} className="bg-slate-50 border border-slate-200 rounded-3xl p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-xs font-black text-slate-900">{p.partyName}</div>
                              <div className="text-[11px] text-slate-500 mt-1">
                                {((p.partyType || 'CLIENT').toString().toUpperCase())} • {p.contactPerson || 'No contact'} • {p.mobileNumber || p.partyMobile || 'No mobile'}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-1">
                                📍 {p.placeCity || 'Unknown'}{p.state ? `, ${p.state}` : ''}
                              </div>
                            </div>
                            <span className={`text-[10px] font-bold uppercase rounded-full px-2 py-1 ${((p.status || 'ACTIVE') === 'ACTIVE' && 'bg-emerald-100 text-emerald-700') || ((p.status || 'ACTIVE') === 'INACTIVE' && 'bg-slate-100 text-slate-700') || 'bg-rose-100 text-rose-700'}`}>
                              {p.status || 'ACTIVE'}
                            </span>
                          </div>
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600">
                            <div><strong>GST:</strong> {p.gstNumber || '—'}</div>
                            <div><strong>Billing:</strong> {p.billingAddress || '—'}</div>
                          </div>
                          <div className="mt-3 flex gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleEditPartyMaster(p)}
                              className="px-3 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-xl"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePartyMaster(p.id)}
                              className="px-3 py-2 bg-rose-50 text-rose-700 border border-rose-100 text-[11px] font-bold rounded-xl"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    {partyMasters.filter((p) => partyTypeFilter === 'ALL' || ((p.partyType || '').toString().toUpperCase() === partyTypeFilter))
                      .filter((p) => partyPlaceFilter === 'ALL' || (p.placeCity || '').toString().toLowerCase() === partyPlaceFilter.toString().toLowerCase())
                      .filter((p) => partyStatusFilter === 'ALL' || (p.status || 'ACTIVE') === partyStatusFilter)
                      .filter((p) => {
                        if (!partySearchQuery) return true;
                        const q = partySearchQuery.toLowerCase();
                        return p.partyName.toLowerCase().includes(q) ||
                          (p.mobileNumber || p.partyMobile || '').toLowerCase().includes(q) ||
                          (p.placeCity || '').toLowerCase().includes(q) ||
                          (p.state || '').toLowerCase().includes(q) ||
                          (p.partyType || '').toLowerCase().includes(q);
                      }).length === 0 && (
                        <div className="text-center py-12 text-slate-400">No party records found.</div>
                      )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== ROUTE MASTER MODULE DIALOG SHEET ==================== */}
      {showRouteMasterModal && (
        <div className="fixed inset-0 bg-slate-50 z-50 overflow-y-auto text-slate-800">
          <div className="w-full min-w-0 min-h-screen px-6 py-5 text-left flex flex-col">
            <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur flex flex-col lg:flex-row lg:items-start gap-4 justify-between border-b border-slate-200 py-4 mb-4">
              <div>
                <h3 className="text-base font-black text-slate-900">🛣️ Route Master</h3>
                <p className="text-[11px] text-slate-500 mt-1">Manage standard routes, transit days, and distances.</p>
              </div>
              <button
                type="button"
                onClick={() => { setShowRouteMasterModal(false); resetRouteForm(); }}
                className="px-3 py-2 text-slate-600 bg-slate-100 rounded-xl font-bold text-xs"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-5">
              <div className="bg-slate-50 rounded-3xl border border-slate-200 p-5 space-y-4">
                <h4 className="text-sm font-black text-slate-900">{editingRoute ? 'Edit Route' : 'Add New Route'}</h4>
                <form onSubmit={handleSaveRouteMaster} className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-500 font-bold block mb-1">Source / Loading Point *</label>
                      <input
                        type="text"
                        required
                        value={routeForm.fromCity}
                        onChange={(e) => setRouteForm(prev => ({ ...prev, fromCity: e.target.value }))}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                        placeholder="e.g. Mumbai"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 font-bold block mb-1">Destination / Unloading Point *</label>
                      <input
                        type="text"
                        required
                        value={routeForm.toCity}
                        onChange={(e) => setRouteForm(prev => ({ ...prev, toCity: e.target.value }))}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                        placeholder="e.g. Delhi"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-500 font-bold block mb-1">Route Name (Optional)</label>
                      <input
                        type="text"
                        value={routeForm.routeName}
                        onChange={(e) => setRouteForm(prev => ({ ...prev, routeName: e.target.value }))}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                        placeholder="e.g. Mumbai to Delhi Fast"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 font-bold block mb-1">Via / Highway</label>
                      <input
                        type="text"
                        value={routeForm.viaRoute}
                        onChange={(e) => setRouteForm(prev => ({ ...prev, viaRoute: e.target.value }))}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                        placeholder="e.g. NH-48"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-slate-500 font-bold block mb-1">Distance (KM)</label>
                      <input
                        type="number"
                        value={routeForm.distanceKm}
                        onChange={(e) => setRouteForm(prev => ({ ...prev, distanceKm: e.target.value }))}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 font-bold block mb-1">Transit Time (Days/Hours)</label>
                      <input
                        type="number"
                        value={routeForm.transitHours}
                        onChange={(e) => setRouteForm(prev => ({ ...prev, transitHours: e.target.value }))}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                        placeholder="e.g. 48 for 2 days"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 font-bold block mb-1">Status</label>
                      <select
                        value={routeForm.recordStatus}
                        onChange={(e) => setRouteForm(prev => ({ ...prev, recordStatus: e.target.value as 'Active' | 'Inactive' }))}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </div>
                  </div>

                  <div className="sticky bottom-0 z-20 -mx-5 flex gap-3 justify-end px-5 py-4 border-t border-slate-200 bg-slate-50/95 backdrop-blur">
                    <button
                      type="button"
                      onClick={() => { resetRouteForm(); setShowRouteMasterModal(false); }}
                      className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg text-xs"
                    >
                      {editingRoute ? 'Update Route' : 'Save Route'}
                    </button>
                  </div>
                </form>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-50 rounded-3xl border border-slate-200 p-5">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-black text-slate-900">Saved Routes ({routeMasters.length})</h4>
                  </div>
                  <div className="mb-4">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search by city, code, or name..."
                        value={routeSearchQuery}
                        onChange={(e) => setRouteSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  </div>
                  <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                    {routeMasters
                      .filter((r) => {
                        if (!routeSearchQuery) return true;
                        const q = routeSearchQuery.toLowerCase();
                        return (
                          (r.routeName || '').toLowerCase().includes(q) ||
                          (r.routeCode || '').toLowerCase().includes(q) ||
                          (r.fromCity || r.loadingPoint || '').toLowerCase().includes(q) ||
                          (r.toCity || r.unloadingPoint || '').toLowerCase().includes(q)
                        );
                      })
                      .map((r, i) => (
                        <div key={r.id || `route-${i}`} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-200 transition-colors">
                          <div className="flex justify-between items-start">
                            <div>
                              <strong className="text-slate-900 block text-xs">
                                {r.fromCity || r.loadingPoint} ➔ {r.toCity || r.unloadingPoint}
                              </strong>
                              <span className="text-[10px] text-slate-500 font-mono mt-1 block">
                                {r.routeCode || 'Uncoded'} | {r.distanceKm ? `${r.distanceKm} km` : 'Distance N/A'}
                              </span>
                            </div>
                            <span className={`text-[10px] font-bold uppercase rounded-full px-2 py-1 ${((r.recordStatus || (r.active === false ? 'Inactive' : 'Active')) === 'Active') ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                              {r.recordStatus || (r.active === false ? 'Inactive' : 'Active')}
                            </span>
                          </div>
                          <div className="mt-3 flex gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleEditRouteMaster(r)}
                              className="px-3 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-xl"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRouteMaster(r.id)}
                              className="px-3 py-2 bg-rose-50 text-rose-700 border border-rose-100 text-[11px] font-bold rounded-xl"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    {routeMasters.length === 0 && (
                      <div className="text-center py-12 text-slate-400 text-xs">No route records found.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== CREATE DISPATCH TRIP FORM DIALOG SHEET ==================== */}
      {showAssignTrip && (
        <div className="fixed inset-0 bg-slate-50 z-50 overflow-y-auto text-slate-800">
          <div className="w-full max-w-[1500px] mx-auto min-h-screen px-6 py-5 text-left flex flex-col">
            <h3 className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur text-lg font-black text-slate-900 border-b border-slate-200 py-4 block">Dispatch Planning</h3>
            <form onSubmit={handleAssignTrip} className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 py-6 text-xs">
              <div>
                <label className="text-slate-500 font-bold block mb-1">Select Compliant Vehicle *</label>
                <select
                  required
                  value={newTrip.vehicleNumber}
                  onChange={(e) => {
                    const vNum = e.target.value;
                    const linkedVehicle = vehicles.find(v => isVehicleActive(v) && v.vehicleNumber === vNum);
                    setNewTrip(prev => {
                      const updated = { ...prev, vehicleNumber: vNum };
                      if (linkedVehicle && linkedVehicle.linkedDriverId) {
                        const drObj = drivers.find(d => d.id === linkedVehicle.linkedDriverId);
                        if (drObj) {
                          updated.driverId = drObj.id;
                        }
                      }
                      return updated;
                    });
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                >
                  <option value="">-- Choose Truck --</option>
                  {vehicles.filter(isVehicleActive).map((v) => (
                    <option key={v.id} value={v.vehicleNumber}>
                      {v.vehicleNumber} - {v.vehicleType} {v.linkedDriverName ? `(🔗 Lead: ${v.linkedDriverName})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-500 font-bold block mb-1">Select Available Driver *</label>
                <select
                  required
                  value={newTrip.driverId}
                  onChange={(e) => {
                    const drId = e.target.value;
                    const linkedDriver = drivers.find(d => d.id === drId);
                    setNewTrip(prev => {
                      const updated = { ...prev, driverId: drId };
                      if (linkedDriver && linkedDriver.linkedVehicleNumber) {
                        const vehObj = vehicles.find(v => isVehicleActive(v) && v.vehicleNumber === linkedDriver.linkedVehicleNumber);
                        if (vehObj) {
                          updated.vehicleNumber = vehObj.vehicleNumber;
                        }
                      }
                      return updated;
                    });
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                >
                  <option value="">-- Choose Driver --</option>
                  {drivers
                    .filter(d => d.driverStatus === 'available' || d.id === (vehicles.find(v => isVehicleActive(v) && v.vehicleNumber === newTrip.vehicleNumber)?.linkedDriverId))
                    .map((d) => {
                      const isLinkedToCurrent = d.linkedVehicleNumber === newTrip.vehicleNumber && newTrip.vehicleNumber !== '';
                      return (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.driverCode} - {isLinkedToCurrent ? '🔗 Linked Regular Driver' : (d.driverStatus === 'available' ? 'Available' : 'On-Call')})
                        </option>
                      );
                    })}
                </select>
              </div>

              <div>
                <label className="text-slate-500 font-bold block mb-1">Loading Origin Point *</label>
                <input
                  type="text"
                  required
                  list="loading-points-list"
                  value={newTrip.loadingPoint}
                  onChange={(e) => setNewTrip(prev => ({ ...prev, loadingPoint: e.target.value }))}
                  placeholder="Noida Warehouse Hub 5"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 block"
                />
              </div>

              <div>
                <label className="text-slate-500 font-bold block mb-1">Unloading Destination Point *</label>
                <input
                  type="text"
                  required
                  list="unloading-points-list"
                  value={newTrip.unloadingPoint}
                  onChange={(e) => setNewTrip(prev => ({ ...prev, unloadingPoint: e.target.value }))}
                  placeholder="Jaipur Ring Road Godown"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 block"
                />
              </div>

              <div>
                <label className="text-slate-500 font-bold block mb-1">Estimated Travel Hours (ETA) *</label>
                <input
                  type="text"
                  required
                  value={newTrip.eta}
                  onChange={(e) => setNewTrip(prev => ({ ...prev, eta: e.target.value }))}
                  placeholder="24 Hours"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 block"
                />
              </div>

              <div className="lg:col-span-2 xl:col-span-3 sticky bottom-0 z-20 -mx-6 flex gap-2 justify-end px-6 py-4 border-t border-slate-200 bg-slate-50/95 backdrop-blur">
                <button
                  type="button"
                  onClick={() => setShowAssignTrip(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setNewTrip({ vehicleNumber: '', driverId: '', loadingPoint: '', unloadingPoint: '', eta: '24 Hours' })}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg cursor-pointer"
                >
                  Reset
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg cursor-pointer text-xs"
                >
                  Confirm Dispatch
                </button>
              </div>
            </form>
            <div className="mt-8 border-t border-slate-200 pt-6">
              <div className="sticky top-16 z-10 bg-slate-50/95 backdrop-blur border border-slate-200 rounded-2xl p-4 mb-4">
                <div className="flex flex-col xl:flex-row xl:items-end gap-3 justify-between">
                  <div className="flex-1">
                    <h4 className="text-sm font-black text-slate-900 mb-2">Trip History</h4>
                    <input
                      type="text"
                      value={tripHistorySearch}
                      onChange={(e) => setTripHistorySearch(e.target.value)}
                      placeholder="Search vehicle, driver, loading point, unloading point..."
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ['all', 'All'],
                      ['assigned', 'Assigned'],
                      ['running', 'Running'],
                      ['completed', 'Completed'],
                      ['late', 'Late']
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setTripHistoryFilter(value as any)}
                        className={`px-3 py-2 rounded-full text-[11px] font-bold ${tripHistoryFilter === value ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-2xl bg-white">
                <table className="min-w-[1050px] w-full text-left text-xs">
                  <thead className="text-slate-600 font-black uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Vehicle</th>
                      <th className="p-3">Driver</th>
                      <th className="p-3">Loading</th>
                      <th className="p-3">Unloading</th>
                      <th className="p-3">ETA</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTripHistory.map(trip => (
                      <tr key={trip.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-bold">{trip.vehicleNumber || '-'}</td>
                        <td className="p-3">{trip.driverName || '-'}</td>
                        <td className="p-3 max-w-[180px] truncate">{trip.loadingPoint || '-'}</td>
                        <td className="p-3 max-w-[180px] truncate">{trip.unloadingPoint || '-'}</td>
                        <td className="p-3">{trip.eta || '-'}</td>
                        <td className="p-3">{trip.status}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1.5">
                            <button type="button" onClick={() => window.alert(`Vehicle: ${trip.vehicleNumber}\nDriver: ${trip.driverName}\nRoute: ${trip.loadingPoint} to ${trip.unloadingPoint}\nStatus: ${trip.status}`)} className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-bold">View</button>
                            <button type="button" onClick={() => setNewTrip({ vehicleNumber: trip.vehicleNumber, driverId: trip.driverId, loadingPoint: trip.loadingPoint, unloadingPoint: trip.unloadingPoint, eta: trip.eta })} className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 font-bold">Edit</button>
                            <button type="button" onClick={() => handleDeleteTrip(trip.id, trip.vehicleNumber, trip.driverId)} className="px-2 py-1 rounded-full bg-rose-100 text-rose-700 font-bold">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredTripHistory.length === 0 && (
                  <div className="p-8 text-center text-sm text-slate-500">No records found</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MOVEMENT CREATE / HISTORY DIALOG SHEET ==================== */}
      {showAddMovement && (
        <div className="fixed inset-0 bg-slate-50 z-50 text-slate-800">
          <div className="w-full min-w-0 h-full min-h-0 overflow-y-auto px-6 py-5 text-left flex flex-col">
            <h3 className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur text-lg font-black text-slate-900 border-b border-slate-200 py-4 block">Movement Create</h3>
            <form onSubmit={handleCreateMovement} className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 py-6 text-xs">
              <div className="xl:col-span-3">
                <label className="text-slate-500 font-bold block mb-1">Active Trip / LR *</label>
                <select
                  required
                  value={selectedTripForMovement?.id || ''}
                  onChange={(e) => {
                    const trip = trips.find(t => t.id === e.target.value) || null;
                    const linkedLoading = trip ? loadingConfirmations.find(lc => lc.tripId === trip.id) : undefined;
                    const linkedLr = trip ? consignments.find(lr => lr.tripId === trip.id) : undefined;
                    setSelectedTripForMovement(trip);
                    setNewMovement(prev => ({
                      ...prev,
                      vehicleNumber: trip?.vehicleNumber || '',
                      driverName: trip?.driverName || '',
                      loadingConfirmNo: linkedLoading?.loadingNo || linkedLoading?.id || '',
                      lrNumber: linkedLr?.lrNumber || linkedLr?.id || '',
                      routeDetails: linkedLr?.routeDetails || linkedLoading?.routeDetails || (trip ? `${trip.loadingPoint} to ${trip.unloadingPoint}` : ''),
                      consigneeName: linkedLr?.consigneeName || '',
                      consigneeMobile: linkedLr?.consigneeMobile || '',
                      unloadingPoint: trip?.unloadingPoint || linkedLr?.consigneeName || '',
                      unloadingGoogleMapLocation: '',
                      eWayBillNumber: '',
                      eWayBillExpiryDate: '',
                      reportingDate: '',
                      reportingTime: '',
                      startKm: trip?.startKm?.toString() || ''
                    }));
                  }}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                >
                  <option value="">-- Select active trip --</option>
                  {trips
                    .filter(t => t.status !== 'completed')
                    .map(t => {
                      const linkedLr = consignments.find(lr => lr.tripId === t.id);
                      return (
                        <option key={t.id} value={t.id}>
                          {linkedLr?.lrNumber || linkedLr?.id || 'No LR'} - {t.vehicleNumber} - {t.driverName} - {t.loadingPoint} to {t.unloadingPoint}
                        </option>
                      );
                    })}
                </select>
              </div>

              <div>
                <label className="text-slate-500 font-bold block mb-1">Movement No</label>
                <input
                  type="text"
                  value={newMovement.movementId}
                  onChange={(e) => setNewMovement(prev => ({ ...prev, movementId: e.target.value }))}
                  placeholder="Auto generated"
                  className="w-full font-mono bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="text-slate-500 font-bold block mb-1">Vehicle</label>
                <input type="text" readOnly value={newMovement.vehicleNumber} className="w-full font-mono bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-500" />
              </div>
              <div>
                <label className="text-slate-500 font-bold block mb-1">Driver</label>
                <input type="text" readOnly value={newMovement.driverName} className="w-full bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-500" />
              </div>
              <div>
                <label className="text-slate-500 font-bold block mb-1">Loading Confirm No</label>
                <input type="text" readOnly value={newMovement.loadingConfirmNo} className="w-full font-mono bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-500" />
              </div>
              <div>
                <label className="text-slate-500 font-bold block mb-1">LR No</label>
                <input type="text" readOnly value={newMovement.lrNumber} className="w-full font-mono bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-500" />
              </div>
              <div>
                <label className="text-slate-500 font-bold block mb-1">Start KM</label>
                <input
                  type="text"
                  value={newMovement.startKm}
                  onChange={(e) => setNewMovement(prev => ({ ...prev, startKm: e.target.value.replace(/\D/g, '') }))}
                  className="w-full font-mono bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                />
              </div>
              <div className="xl:col-span-3">
                <label className="text-slate-500 font-bold block mb-1">Route Details</label>
                <input
                  type="text"
                  readOnly
                  value={newMovement.routeDetails}
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-500"
                />
              </div>
              <div>
                <label className="text-slate-500 font-bold block mb-1">Consignee Name</label>
                <input type="text" readOnly value={newMovement.consigneeName} className="w-full bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-500" />
              </div>
              <div>
                <label className="text-slate-500 font-bold block mb-1">Consignee Mobile Number</label>
                <input type="text" readOnly value={newMovement.consigneeMobile} className="w-full font-mono bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-500" />
              </div>
              <div>
                <label className="text-slate-500 font-bold block mb-1">Unloading Point / Location</label>
                <input
                  type="text"
                  value={newMovement.unloadingPoint}
                  onChange={(e) => setNewMovement(prev => ({ ...prev, unloadingPoint: e.target.value }))}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                />
              </div>
              <div className="xl:col-span-3">
                <label className="text-slate-500 font-bold block mb-1">Google Map Location for Unloading Point</label>
                <input
                  type="text"
                  value={newMovement.unloadingGoogleMapLocation}
                  onChange={(e) => setNewMovement(prev => ({ ...prev, unloadingGoogleMapLocation: e.target.value }))}
                  placeholder="Paste Google Maps link or coordinates"
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="text-slate-500 font-bold block mb-1">E-Way Bill Number</label>
                <input
                  type="text"
                  value={newMovement.eWayBillNumber}
                  onChange={(e) => setNewMovement(prev => ({ ...prev, eWayBillNumber: e.target.value }))}
                  className="w-full font-mono bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="text-slate-500 font-bold block mb-1">E-Way Bill Expiry Date</label>
                <input
                  type="date"
                  value={newMovement.eWayBillExpiryDate}
                  onChange={(e) => setNewMovement(prev => ({ ...prev, eWayBillExpiryDate: e.target.value }))}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="text-slate-500 font-bold block mb-1">Reporting Date</label>
                <input
                  type="date"
                  value={newMovement.reportingDate}
                  onChange={(e) => setNewMovement(prev => ({ ...prev, reportingDate: e.target.value }))}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="text-slate-500 font-bold block mb-1">Reporting Time</label>
                <input
                  type="time"
                  value={newMovement.reportingTime}
                  onChange={(e) => setNewMovement(prev => ({ ...prev, reportingTime: e.target.value }))}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="text-slate-500 font-bold block mb-1">Expected Arrival Date *</label>
                <input
                  type="date"
                  required
                  value={newMovement.expectedArrivalDate}
                  onChange={(e) => setNewMovement(prev => ({ ...prev, expectedArrivalDate: e.target.value }))}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="text-slate-500 font-bold block mb-1">Expected Arrival Time *</label>
                <input
                  type="time"
                  required
                  value={newMovement.expectedArrivalTime}
                  onChange={(e) => setNewMovement(prev => ({ ...prev, expectedArrivalTime: e.target.value }))}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="text-slate-500 font-bold block mb-1">Fuel Issued Liters</label>
                <input
                  type="text"
                  value={newMovement.fuelIssuedLiters}
                  onChange={(e) => setNewMovement(prev => ({ ...prev, fuelIssuedLiters: e.target.value.replace(/\D/g, '') }))}
                  className="w-full font-mono bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="text-slate-500 font-bold block mb-1">Fuel Mode</label>
                <select
                  value={newMovement.fuelCashCard}
                  onChange={(e) => setNewMovement(prev => ({ ...prev, fuelCashCard: e.target.value }))}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                </select>
              </div>
              <div className="xl:col-span-3 sticky bottom-0 z-20 -mx-6 flex gap-2 justify-end px-6 py-4 border-t border-slate-200 bg-slate-50/95 backdrop-blur">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMovement(false);
                    setSelectedTripForMovement(null);
                  }}
                  className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg cursor-pointer text-xs"
                >
                  Create Movement
                </button>
              </div>
            </form>

            <div className="mt-8 border-t border-slate-200 pt-6">
              <div className="sticky top-16 z-10 bg-slate-50/95 backdrop-blur border border-slate-200 rounded-2xl p-4 mb-4">
                <div className="flex flex-col xl:flex-row xl:items-end gap-3 justify-between">
                  <div className="flex-1">
                    <h4 className="text-sm font-black text-slate-900 mb-2">Movement History</h4>
                    <input
                      type="text"
                      value={movementHistorySearch}
                      onChange={(e) => setMovementHistorySearch(e.target.value)}
                      placeholder="Search movement, vehicle, driver, LR, route, consignee, E-Way..."
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ['all', 'All'],
                      ['running', 'Running'],
                      ['completed', 'Completed']
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setMovementHistoryFilter(value as any)}
                        className={`px-3 py-2 rounded-full text-[11px] font-bold ${movementHistoryFilter === value ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-2xl bg-white">
                <table className="min-w-[1500px] w-full text-left text-xs">
                  <thead className="text-slate-600 font-black uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Movement</th>
                      <th className="p-3">Vehicle</th>
                      <th className="p-3">Driver</th>
                      <th className="p-3">LR</th>
                      <th className="p-3">Loading Confirm</th>
                      <th className="p-3">Route</th>
                      <th className="p-3">Consignee</th>
                      <th className="p-3">Mobile</th>
                      <th className="p-3">E-Way Bill</th>
                      <th className="p-3">E-Way Expiry</th>
                      <th className="p-3">Reporting</th>
                      <th className="p-3">Start KM</th>
                      <th className="p-3">Fuel</th>
                      <th className="p-3">Expected Arrival</th>
                      <th className="p-3">Trip Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMovementHistory.map(movement => {
                      const linkedTrip = trips.find(t => t.id === movement.tripId);
                      const linkedLoading = loadingConfirmations.find(lc => lc.tripId === movement.tripId);
                      const linkedLr = consignments.find(lr => lr.tripId === movement.tripId || lr.id === (movement as any).lrNumber || lr.lrNumber === (movement as any).lrNumber);
                      return (
                        <tr key={movement.id} className="hover:bg-slate-50">
                          <td className="p-3 font-mono font-bold">{movement.movementNumber || (movement as any).movementId || movement.id}</td>
                          <td className="p-3 font-mono">{movement.vehicleNumber || linkedTrip?.vehicleNumber || '-'}</td>
                          <td className="p-3">{movement.driverName || linkedTrip?.driverName || '-'}</td>
                          <td className="p-3 font-mono">{(movement as any).lrNumber || linkedLr?.lrNumber || linkedLr?.id || '-'}</td>
                          <td className="p-3 font-mono">{(movement as any).loadingConfirmNo || linkedLoading?.loadingNo || linkedLoading?.id || '-'}</td>
                          <td className="p-3 max-w-[200px] truncate">{(movement as any).routeDetails || movement.route || linkedLr?.routeDetails || linkedLoading?.routeDetails || '-'}</td>
                          <td className="p-3">{(movement as any).consigneeName || linkedLr?.consigneeName || '-'}</td>
                          <td className="p-3 font-mono">{(movement as any).consigneeMobile || linkedLr?.consigneeMobile || '-'}</td>
                          <td className="p-3 font-mono">{(movement as any).eWayBillNumber || '-'}</td>
                          <td className="p-3 font-mono">{(movement as any).eWayBillExpiryDate || '-'}</td>
                          <td className="p-3 font-mono">{(movement as any).reportingDate || '-'} {(movement as any).reportingTime || ''}</td>
                          <td className="p-3 font-mono">{movement.startKm || (movement as any).startKm || '-'}</td>
                          <td className="p-3">{movement.fuelIssued || (movement as any).fuelIssuedLiters || '-'}</td>
                          <td className="p-3 font-mono">
                            {movement.expectedArrivalDate || '-'} {movement.expectedArrivalTime || ''}
                          </td>
                          <td className="p-3">{linkedTrip?.status || (movement as any).status || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredMovementHistory.length === 0 && (
                  <div className="p-8 text-center text-sm text-slate-500">No records found</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== POD REJECTION DIALOG SHEET OVERLAY ==================== */}
      {rejectingPodId && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 max-w-sm w-full text-left">
            <h3 className="text-sm font-black text-rose-600 block">❌ Reject POD Upload Submission</h3>
            <p className="text-[11px] text-slate-400 mt-1">Specify correction feedback details so the assigned driver was prompted to capture a new reciept challan document on his smartphone.</p>

            <div className="py-4 space-y-3">
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Rejection correction criteria label *</label>
              <textarea
                required
                value={podRejectionReason}
                onChange={(e) => setPodRejectionReason(e.target.value)}
                placeholder="जैसे: पर्ची धुंधली है। साफ़ तस्वीर अपलोड करें। (Reciept image blurry. Capture in clear sunlight.)"
                className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 h-24 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t border-slate-100 text-xs">
              <button
                onClick={() => {
                  setRejectingPodId(null);
                  setPodRejectionReason('');
                }}
                className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRejectPod(rejectingPodId)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-lg cursor-pointer"
              >
                Reject & Request Retake
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== EDIT DRIVER FORM DIALOG SHEET ==================== */}
      {showEditDriver && editingDriver && (
        <div className="fixed inset-0 bg-slate-50 z-50 overflow-y-auto text-slate-800" id="edit-driver-modal">
          <div className="w-full min-w-0 min-h-screen px-6 py-5 text-left flex flex-col">
            <h3 className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur text-lg font-black text-slate-900 border-b border-slate-200 py-4 block">Driver Profile Edit</h3>
            <form onSubmit={handleEditDriver} className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 py-6 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Driver Name *</label>
                  <input
                    type="text"
                    required
                    value={editingDriver.name}
                    onChange={(e) => setEditingDriver(prev => prev ? ({ ...prev, name: e.target.value }) : null)}
                    placeholder="Sohan Singh"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                    id="edit-driver-name"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Mobile Contact *</label>
                  <input
                    type="tel"
                    maxLength={10}
                    required
                    value={editingDriver.mobile}
                    onChange={(e) => setEditingDriver(prev => prev ? ({ ...prev, mobile: e.target.value.replace(/\D/g, '') }) : null)}
                    className="w-full font-mono bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Driver Login OTP *</label>
                  <input
                    type="text"
                    required
                    value={editingDriver.loginOtp || ''}
                    onChange={(e) => setEditingDriver(prev => prev ? ({ ...prev, loginOtp: e.target.value.replace(/\D/g, '').slice(0, 6) }) : null)}
                    placeholder="1234"
                    className="w-full font-mono bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-600">
                  <input
                    type="checkbox"
                    checked={editingDriver.otpActive === true}
                    onChange={(e) => setEditingDriver(prev => prev ? ({ ...prev, otpActive: e.target.checked }) : null)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  OTP Active
                </label>
              </div>

              <div>
                <label className="text-slate-500 font-bold block mb-1">Residential Address</label>
                <input
                  type="text"
                  value={editingDriver.address}
                  onChange={(e) => setEditingDriver(prev => prev ? ({ ...prev, address: e.target.value }) : null)}
                  placeholder="Plot 4, Gali No. 2, Rohini Sector 1, New Delhi"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Aadhaar Card No</label>
                  <input
                    type="text"
                    value={editingDriver.aadhaarNumber}
                    onChange={(e) => setEditingDriver(prev => prev ? ({ ...prev, aadhaarNumber: e.target.value }) : null)}
                    placeholder="1234-5678-9999"
                    className="w-full font-mono bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">PAN Card No</label>
                  <input
                    type="text"
                    value={editingDriver.panNumber}
                    onChange={(e) => setEditingDriver(prev => prev ? ({ ...prev, panNumber: e.target.value }) : null)}
                    placeholder="ABCDE1234F"
                    className="w-full font-mono bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Driving License (DL) No</label>
                  <input
                    type="text"
                    value={editingDriver.drivingLicenceNumber}
                    onChange={(e) => setEditingDriver(prev => prev ? ({ ...prev, drivingLicenceNumber: e.target.value }) : null)}
                    placeholder="DL-14201093348"
                    className="w-full font-mono bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">DL Expiry Date</label>
                  <input
                    type="date"
                    value={editingDriver.licenceExpiryDate}
                    onChange={(e) => setEditingDriver(prev => prev ? ({ ...prev, licenceExpiryDate: e.target.value }) : null)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-500 font-bold block mb-1">🔗 Link Regular Truck / नियमित ट्रक लिंक करें</label>
                <select
                  value={editingDriver.linkedVehicleId || ''}
                  onChange={(e) => setEditingDriver(prev => prev ? ({ ...prev, linkedVehicleId: e.target.value || '' }) : null)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                >
                  <option value="">-- No Regular Truck / कोई ट्रक लिंक नहीं --</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.vehicleNumber} ({v.vehicleType})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  * Regularly driving the same truck? Setting this links them together and pre-fills them during trip assignments!
                </p>
              </div>

              <div>
                <label className="text-slate-500 font-bold block mb-1">Driver Status</label>
                <select
                  value={editingDriver.driverStatus}
                  onChange={(e) => setEditingDriver(prev => prev ? ({ ...prev, driverStatus: e.target.value as any }) : null)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                >
                  <option value="available">Available (ड्यूटी के लिए उपलब्ध)</option>
                  <option value="on_trip">On Trip (गाड़ी पर है)</option>
                  <option value="inactive">Inactive (छुट्टी पर या निलंबित)</option>
                </select>
              </div>

              <div className="lg:col-span-2 xl:col-span-3 sticky bottom-0 z-20 -mx-6 flex gap-2 justify-end px-6 py-4 border-t border-slate-200 bg-slate-50/95 backdrop-blur">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditDriver(false);
                    setEditingDriver(null);
                  }}
                  className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                {!isViewOnlyDriver && (
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg cursor-pointer text-xs"
                  >
                    Update Driver
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== EDIT VEHICLE FORM DIALOG SHEET ==================== */}
      {showEditVehicle && editingVehicle && (
        <div className="fixed inset-0 bg-slate-50 z-50 overflow-y-auto text-slate-800" id="edit-vehicle-modal">
          <div className="w-full min-w-0 min-h-screen px-6 py-5 text-left flex flex-col">
            <h3 className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur text-lg font-black text-slate-900 border-b border-slate-200 py-4 block">Vehicle Registry Edit</h3>
            <form onSubmit={handleEditVehicle} className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 py-6 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1 text-slate-400">Vehicle Reg Number (Read-only)</label>
                  <input
                    type="text"
                    disabled
                    value={editingVehicle.vehicleNumber}
                    className="w-full font-mono bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-400 cursor-not-allowed"
                    id="edit-vehicle-number"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Ownership Type</label>
                  <select
                    value={editingVehicle.ownershipType}
                    onChange={(e) => setEditingVehicle(prev => prev ? ({ ...prev, ownershipType: e.target.value as any }) : null)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  >
                    <option value="owned">Owned Fleet (DNK)</option>
                    <option value="attached">Attached Private Sublease</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Body Truck Type</label>
                  <input
                    type="text"
                    value={editingVehicle.vehicleType}
                    onChange={(e) => setEditingVehicle(prev => prev ? ({ ...prev, vehicleType: e.target.value }) : null)}
                    placeholder="HCV Multi-axle Heavy Truck"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Tonnage Payload Capacity</label>
                  <input
                    type="text"
                    value={editingVehicle.capacity}
                    onChange={(e) => setEditingVehicle(prev => prev ? ({ ...prev, capacity: e.target.value }) : null)}
                    placeholder="24 Tons"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Owner Full Name</label>
                  <input
                    type="text"
                    value={editingVehicle.ownerName}
                    onChange={(e) => setEditingVehicle(prev => prev ? ({ ...prev, ownerName: e.target.value }) : null)}
                    placeholder="Sher Singh Transport"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Owner Contact Phone</label>
                  <input
                    type="tel"
                    value={editingVehicle.ownerMobile}
                    onChange={(e) => setEditingVehicle(prev => prev ? ({ ...prev, ownerMobile: e.target.value.replace(/\D/g, '') }) : null)}
                    placeholder="9876501234"
                    className="w-full font-mono bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-500 font-bold block mb-1">🔗 Link Regular Driver / नियमित ड्राइवर लिंक करें</label>
                <select
                  value={editingVehicle.linkedDriverId || ''}
                  onChange={(e) => setEditingVehicle(prev => prev ? ({ ...prev, linkedDriverId: e.target.value || '' }) : null)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                >
                  <option value="">-- No Regular Driver / कोई ड्राइवर लिंक नहीं --</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.driverCode})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  * Regularly driving the same truck? Setting this links them together and pre-fills them during trip assignments!
                </p>
              </div>

              {/* Compliance Expiries panel */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[9px] font-bold text-slate-600 block uppercase tracking-wider">Compliance Expiry Tracking Calendar</span>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <label className="text-slate-500 font-bold block mb-0.5">Insurance Expiry Date</label>
                    <input
                      type="date"
                      value={editingVehicle.insuranceExpiry}
                      onChange={(e) => setEditingVehicle(prev => prev ? ({ ...prev, insuranceExpiry: e.target.value }) : null)}
                      className="w-full bg-white border border-slate-200 rounded p-1 text-[10px] text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 font-bold block mb-0.5">Fitness Certificate Expiry</label>
                    <input
                      type="date"
                      value={editingVehicle.fitnessExpiry}
                      onChange={(e) => setEditingVehicle(prev => prev ? ({ ...prev, fitnessExpiry: e.target.value }) : null)}
                      className="w-full bg-white border border-slate-200 rounded p-1 text-[10px] text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 font-bold block mb-0.5">Permit Expiry Date</label>
                    <input
                      type="date"
                      value={editingVehicle.permitExpiry}
                      onChange={(e) => setEditingVehicle(prev => prev ? ({ ...prev, permitExpiry: e.target.value }) : null)}
                      className="w-full bg-white border border-slate-200 rounded p-1 text-[10px] text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 font-bold block mb-0.5">Pollution PUC Expiry</label>
                    <input
                      type="date"
                      value={editingVehicle.pucExpiry}
                      onChange={(e) => setEditingVehicle(prev => prev ? ({ ...prev, pucExpiry: e.target.value }) : null)}
                      className="w-full bg-white border border-slate-200 rounded p-1 text-[10px] text-slate-800"
                    />
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2 xl:col-span-3 sticky bottom-0 z-20 -mx-6 flex gap-2 justify-end px-6 py-4 border-t border-slate-200 bg-slate-50/95 backdrop-blur">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditVehicle(false);
                    setEditingVehicle(null);
                  }}
                  className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg cursor-pointer text-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== CREATE LOADING POINT MODEL DIALOG ==================== */}
      {showAddLoading && (
        <div className="fixed inset-0 bg-slate-50 z-50 text-slate-800">
          <div className="w-full max-w-[1500px] mx-auto h-full min-h-0 overflow-y-auto px-6 py-5 text-left flex flex-col">
            <h3 className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur text-lg font-black text-slate-900 border-b border-slate-200 py-4 block">Loading Confirmation</h3>
            <div className="py-6">
            <form onSubmit={handleCreateLoading} className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="text-slate-500 font-bold block mb-1">Vehicle Number *</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={vehicleSearch}
                    onChange={(e) => {
                      const value = e.target.value.toUpperCase();
                      setVehicleSearch(value);
                      setShowVehicleSuggestions(value.trim().length > 0);
                      setHighlightedSuggestionIndex(-1);
                      setVehicleNotAvailable(null);
                      if (!value.trim()) {
                        clearSelectedLoadingVehicle();
                      }
                    }}
                    onFocus={() => setShowVehicleSuggestions(vehicleSearch.trim().length > 0)}
                    onBlur={() => {
                      setTimeout(() => setShowVehicleSuggestions(false), 150);
                    }}
                    onKeyDown={(e) => {
                      if (!showVehicleSuggestions || suggestionCount === 0) return;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setHighlightedSuggestionIndex(prev => (prev + 1) % suggestionCount);
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHighlightedSuggestionIndex(prev => (prev <= 0 ? suggestionCount - 1 : prev - 1));
                      }
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (selectedSuggestion) {
                          handleSelectVehicleSuggestion(selectedSuggestion);
                        }
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setShowVehicleSuggestions(false);
                        setHighlightedSuggestionIndex(-1);
                      }
                    }}
                    placeholder="MP04AB1234"
                    className="w-full font-mono bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[11px] text-slate-800"
                  />

                  {showVehicleSuggestions && vehicleSearch.trim() !== '' && (
                    <ul className="absolute left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl mt-1 max-h-40 overflow-auto text-[13px]">
                      {vehicleSuggestions.map((v, index) => (
                        <li
                          key={v.id}
                          onMouseDown={(evt) => { evt.preventDefault(); console.log('Suggestion clicked mouseDown', v); handleSelectVehicleSuggestion(v); }}
                          onClick={() => { console.log('Suggestion clicked onClick', v); handleSelectVehicleSuggestion(v); }}
                          className={`px-3 py-2 cursor-pointer flex flex-col gap-2 ${index === highlightedSuggestionIndex ? 'bg-slate-100' : 'hover:bg-slate-100'}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-mono font-bold">{v.vehicleNumber}</div>
                              <div className="text-[11px] text-slate-500">{v.vehicleType}</div>
                            </div>
                            <div className="text-[11px]">
                              <span className={truckFlagBadgeClassName} style={getTruckFlagStyle(v.statusFlag)}>
                                {v.statusFlag || 'Unknown'}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onMouseDown={(evt) => { evt.preventDefault(); console.log('Select button clicked mouseDown', v); handleSelectVehicleSuggestion(v); }}
                            onClick={() => { console.log('Select button clicked onClick', v); handleSelectVehicleSuggestion(v); }}
                            className="self-start rounded-full bg-indigo-600 text-white px-3 py-1 text-[11px] font-semibold"
                          >
                            SELECT THIS VEHICLE
                          </button>
                        </li>
                      ))}
                      {vehicleSuggestions.length === 0 && (
                        <li className="px-3 py-2 text-slate-500">No matches</li>
                      )}
                    </ul>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Only vehicles with <strong>LOADING FIND</strong> or <strong>WITHOUT DRIVER</strong> status may be selected.</p>
                {selectedLoadingVehicle && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700">
                    <div className="font-semibold text-slate-900">Selected Vehicle Info</div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div><strong>Number:</strong> {selectedLoadingVehicle.vehicleNumber}</div>
                      <div>
                        <strong>Raw Status:</strong>{' '}
                        <span className={truckFlagBadgeClassName} style={getTruckFlagStyle(selectedLoadingVehicle.statusFlag)}>
                          {selectedLoadingVehicle.statusFlag || 'Unknown'}
                        </span>
                      </div>
                      <div>
                        <strong>Derived Status:</strong>{' '}
                        <span className={truckFlagBadgeClassName} style={getTruckFlagStyle(getVehicleDisplayStatus(selectedLoadingVehicle))}>
                          {getVehicleDisplayStatus(selectedLoadingVehicle)}
                        </span>
                      </div>
                      <div><strong>Type:</strong> {selectedLoadingVehicle.vehicleType || 'N/A'}</div>
                      <div><strong>Driver:</strong> {selectedLoadingVehicle.linkedDriverName || selectedLoadingVehicle.linkedDriverId || 'None'}</div>
                      <div><strong>Driver Mobile:</strong> {drivers.find(d => d.id === selectedLoadingVehicle.linkedDriverId)?.mobile || 'Unknown'}</div>
                    </div>
                  </div>
                )}
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700">
                  <div className="font-semibold text-slate-900">Autocomplete Debug</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    <div><strong>Search Query:</strong> {vehicleSearch || 'EMPTY'}</div>
                    <div><strong>Suggestion Count:</strong> {suggestionCount}</div>
                    <div><strong>Highlighted Index:</strong> {highlightedSuggestionIndex >= 0 ? highlightedSuggestionIndex : 'none'}</div>
                    <div>
                      <strong>Derived Vehicle Status:</strong>{' '}
                      {selectedLoadingVehicle ? (
                        <span className={truckFlagBadgeClassName} style={getTruckFlagStyle(getVehicleDisplayStatus(selectedLoadingVehicle))}>
                          {getVehicleDisplayStatus(selectedLoadingVehicle)}
                        </span>
                      ) : 'none'}
                    </div>
                    <div className="sm:col-span-2"><strong>Selected Vehicle:</strong> {selectedLoadingVehicle ? `${selectedLoadingVehicle.vehicleNumber} (${getVehicleDisplayStatus(selectedLoadingVehicle)})` : 'none'}</div>
                  </div>
                </div>
                {vehicleNotAvailable && <p className="text-[11px] text-rose-600 mt-1 font-semibold">{vehicleNotAvailable}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Driver Name</label>
                  <input
                    type="text"
                    readOnly
                    value={newLoading.driverName}
                    placeholder="Auto fetched"
                    className="w-full bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-600"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Driver Mobile</label>
                  <input
                    type="text"
                    readOnly
                    value={newLoading.driverMobile}
                    placeholder="Auto fetched"
                    className="w-full bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-600"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Vehicle Type</label>
                  <input
                    type="text"
                    readOnly
                    value={newLoading.vehicleType}
                    placeholder="Auto fetched"
                    className="w-full bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-600"
                  />
                </div>
              </div>

              <div className="relative">
                <label className="text-slate-500 font-bold block mb-1">Loading Party *</label>
                <input
                  type="text"
                  required
                  placeholder="Type party name to search registry"
                  value={newLoading.loadingParty}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNewLoading(prev => ({ ...prev, loadingParty: value, partyVendorInfo: value }));
                    setSelectedLoadingParty(prev => prev && prev.partyName === value ? prev : null);
                    setShowPartySuggestions(value.trim().length > 0);
                    setHighlightedPartySuggestionIndex(-1);
                  }}
                  onFocus={() => setShowPartySuggestions(newLoading.loadingParty.trim().length > 0)}
                  onBlur={() => {
                    setTimeout(() => setShowPartySuggestions(false), 150);
                  }}
                  onKeyDown={(e) => {
                    const suggestions = partyMasters.filter((p) => p.partyName.toLowerCase().includes(newLoading.loadingParty.trim().toLowerCase()));
                    const count = suggestions.length;
                    if (!showPartySuggestions || count === 0) return;
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setHighlightedPartySuggestionIndex(prev => (prev + 1) % count);
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setHighlightedPartySuggestionIndex(prev => (prev <= 0 ? count - 1 : prev - 1));
                    }
                    if (e.key === 'Enter' && highlightedPartySuggestionIndex >= 0) {
                      e.preventDefault();
                      handleSelectLoadingParty(suggestions[highlightedPartySuggestionIndex]);
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                />
                {showPartySuggestions && newLoading.loadingParty.trim() !== '' && (
                  <ul className="absolute left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl mt-1 max-h-44 overflow-auto text-[12px] shadow-lg">
                    {partyMasters
                      .filter((p) => p.partyName.toLowerCase().includes(newLoading.loadingParty.trim().toLowerCase()))
                      .slice(0, 8)
                      .map((p, index) => (
                        <li
                          key={p.id}
                          onMouseDown={(evt) => { evt.preventDefault(); handleSelectLoadingParty(p); }}
                          className={`px-3 py-2 cursor-pointer ${index === highlightedPartySuggestionIndex ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                        >
                          <div className="font-semibold text-slate-900">{p.partyName}</div>
                          <div className="text-[11px] text-slate-500">
                            {p.partyType} • {p.placeCity || 'Unknown city'} • {p.mobileNumber || 'No mobile'}
                          </div>
                        </li>
                      ))}
                    {partyMasters.filter((p) => p.partyName.toLowerCase().includes(newLoading.loadingParty.trim().toLowerCase())).length === 0 && (
                      <li className="px-3 py-2 text-slate-500">No matching party found.</li>
                    )}
                  </ul>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Party Type</label>
                  <input
                    type="text"
                    readOnly
                    value={newLoading.partyType}
                    placeholder="Auto selected"
                    className="w-full bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-600"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Place / City</label>
                  <input
                    type="text"
                    readOnly
                    value={newLoading.partyPlaceCity}
                    placeholder="Auto selected"
                    className="w-full bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-600"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-500 font-bold block mb-1">Loading Address *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Warehouse Yard A, Gate 3, Sector 62, Noida"
                  value={newLoading.loadingAddress}
                  onChange={(e) => setNewLoading(prev => ({ ...prev, loadingAddress: e.target.value, loadingPointLocation: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                />
              </div>

              <div>
                <RouteSmartSearchInput
                  label="Route Details *"
                  required
                  value={newLoading.routeDetails}
                  onChange={(value) => setNewLoading(prev => ({ ...prev, routeDetails: value }))}
                  routeMasters={routeMasters}
                  placeholder="Type route details, e.g. malanpur%kanpur"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Loading Contact Person *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Yadav"
                    value={newLoading.loadingContactPerson}
                    onChange={(e) => setNewLoading(prev => ({ ...prev, loadingContactPerson: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Loading Mobile *</label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 9876543210"
                    value={newLoading.loadingMobile}
                    onChange={(e) => setNewLoading(prev => ({ ...prev, loadingMobile: e.target.value.replace(/\D/g, "") }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Loading Date *</label>
                  <input
                    type="date"
                    required
                    value={newLoading.loadingDate}
                    onChange={(e) => setNewLoading(prev => ({ ...prev, loadingDate: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Loading Time *</label>
                  <input
                    type="time"
                    required
                    value={newLoading.loadingTime}
                    onChange={(e) => setNewLoading(prev => ({ ...prev, loadingTime: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-500 font-bold block mb-1">Google Map Location *</label>
                <input
                  type="text"
                  required
                  placeholder="Paste Google Maps link or coordinates"
                  value={newLoading.googleMapLocation}
                  onChange={(e) => setNewLoading(prev => ({ ...prev, googleMapLocation: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                />
              </div>

              <div className="lg:col-span-2 xl:col-span-3 sticky bottom-0 z-20 -mx-6 flex gap-2 justify-end px-6 py-4 border-t border-slate-200 bg-slate-50/95 backdrop-blur">
                <button
                  type="button"
                  onClick={() => setShowAddLoading(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVehicleSearch('');
                    setSelectedLoadingVehicle(null);
                    setNewLoading({
                      tripId: '',
                      loadingPointLocation: '',
                      partyVendorInfo: '',
                      routeDetails: '',
                      weightDetails: '',
                      isLoadingConfirmed: false,
                      status: 'pending',
                      loadingNo: '',
                      vehicleNo: '',
                      vehicleType: '',
                      driverName: '',
                      driverMobile: '',
                      loadingParty: '',
                      loadingAddress: '',
                      loadingContactPerson: '',
                      loadingMobile: '',
                      partyType: '',
                      partyPlaceCity: '',
                      googleMapLocation: '',
                      loadingDate: '',
                      loadingTime: '',
                      remarks: ''
                    });
                  }}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg cursor-pointer"
                >
                  Reset
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg cursor-pointer text-xs"
                >
                  Save Loading Confirmation
                </button>
              </div>
            </form>

            <div className="mt-8 border-t border-slate-200 pt-6">
              <div className="sticky top-16 z-10 bg-slate-50/95 backdrop-blur border border-slate-200 rounded-2xl p-4 mb-4">
                <div className="flex flex-col xl:flex-row xl:items-end gap-3 justify-between">
                  <div className="flex-1">
                    <h4 className="text-sm font-black text-slate-900 mb-2">Recent Loading Confirmations</h4>
                    <input
                      type="text"
                      value={loadingHistorySearch}
                      onChange={(e) => setLoadingHistorySearch(e.target.value)}
                      placeholder="Search vehicle, driver, party, address, route..."
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ['all', 'All'],
                      ['confirmed', 'Confirmed'],
                      ['pending', 'Pending'],
                      ['cancelled', 'Cancelled'],
                      ['map_saved', 'Map Saved'],
                      ['map_missing', 'Map Missing']
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setLoadingHistoryFilter(value as any)}
                        className={`px-3 py-2 rounded-full text-[11px] font-bold ${loadingHistoryFilter === value ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-2xl bg-white">
                <table className="min-w-[1100px] w-full text-left text-xs">
                  <thead className="text-slate-600 font-black uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Vehicle</th>
                      <th className="p-3">Driver</th>
                      <th className="p-3">Party</th>
                      <th className="p-3">Address</th>
                      <th className="p-3">Route</th>
                      <th className="p-3">Date / Time</th>
                      <th className="p-3">Map</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLoadingHistory.map(record => (
                      <tr key={record.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-bold">{record.vehicleNo || '-'}</td>
                        <td className="p-3">{record.driverName || '-'}</td>
                        <td className="p-3">{record.loadingParty || record.partyVendorInfo || '-'}</td>
                        <td className="p-3 max-w-[220px] truncate">{record.loadingAddress || record.loadingPointLocation || '-'}</td>
                        <td className="p-3 max-w-[180px] truncate">{record.routeDetails || '-'}</td>
                        <td className="p-3 font-mono">{record.loadingDate || '-'} {record.loadingTime || ''}</td>
                        <td className="p-3">{record.googleMapLocation ? 'Saved' : 'Missing'}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${record.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : record.status === 'cancelled' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                            {record.status}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1.5">
                            <button type="button" onClick={() => window.alert(`Vehicle: ${record.vehicleNo || '-'}\nDriver: ${record.driverName || '-'}\nParty: ${record.loadingParty || record.partyVendorInfo || '-'}\nRoute: ${record.routeDetails || '-'}`)} className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-bold">View</button>
                            <button type="button" onClick={() => startEditLoadingFromRecord(record)} className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 font-bold">Edit</button>
                            {record.status !== 'cancelled' && <button type="button" onClick={() => handleCancelLoading(record.id)} className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-bold">Cancel</button>}
                            <button type="button" onClick={() => handleDeleteLoading(record.id)} className="px-2 py-1 rounded-full bg-rose-100 text-rose-700 font-bold">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredLoadingHistory.length === 0 && (
                  <div className="p-8 text-center text-sm text-slate-500">No records found</div>
                )}
              </div>
            </div>

            {/* --- RECORDS SECTION --- */}
            <div className="hidden">
              <h4 className="text-sm font-black text-slate-900 mb-4">Recent Loading Confirmations</h4>
              {loadingConfirmations.length === 0 ? (
                <div className="text-center py-6 bg-slate-50 rounded-2xl border border-slate-100 text-slate-500 text-xs">
                  No Loading Confirmations Found
                </div>
              ) : (
                <div className="space-y-3">
                  {[...loadingConfirmations]
                    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                    .map(record => (
                    <div key={record.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between text-xs">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                        <div>
                          <span className="text-[10px] uppercase text-slate-500 block">Vehicle</span>
                          <strong className="text-slate-900">{record.vehicleNo || '-'}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-500 block">Driver</span>
                          <strong className="text-slate-900">{record.driverName || '-'}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-500 block">Loading Party</span>
                          <strong className="text-slate-900">{record.loadingParty || record.partyVendorInfo || '-'}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-500 block">Point/Date</span>
                          <strong className="text-slate-900">{record.loadingAddress || record.loadingPointLocation || '-'}</strong>
                          <span className="block text-slate-500">{record.loadingDate} {record.loadingTime}</span>
                          <span className="block text-slate-500">{record.googleMapLocation ? 'Map location saved' : 'Map location missing'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${record.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {record.status}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLoading({
                              ...record,
                              status: record.status as any,
                              loadingParty: record.loadingParty || record.partyVendorInfo || '',
                              loadingAddress: record.loadingAddress || record.loadingPointLocation || '',
                              partyVendorInfo: record.partyVendorInfo || record.loadingParty || '',
                              loadingPointLocation: record.loadingPointLocation || record.loadingAddress || '',
                              googleMapLocation: record.googleMapLocation || '',
                              loadingDate: record.loadingDate || '',
                              loadingTime: record.loadingTime || ''
                            } as any);
                            setShowAddLoading(false);
                            setShowEditLoading(true);
                            setVehicleSearch(record.vehicleNo || '');
                          }}
                          className="p-1.5 bg-white text-indigo-600 border border-slate-200 hover:border-indigo-300 rounded-md transition cursor-pointer"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLoading(record.id)}
                          className="p-1.5 bg-white text-rose-600 border border-slate-200 hover:border-rose-300 rounded-md transition cursor-pointer"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* --- END RECORDS SECTION --- */}
            </div>
          </div>
        </div>
      )}

      {/* ==================== EDIT LOADING POINT MODEL DIALOG ==================== */}
      {showEditLoading && editingLoading && (
        <div className="fixed inset-0 bg-slate-50 z-50 overflow-y-auto text-slate-800">
          <div className="w-full max-w-[1500px] mx-auto min-h-screen px-6 py-5 text-left flex flex-col">
            <h3 className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur text-lg font-black text-slate-900 border-b border-slate-200 py-4 block">Loading Confirmation</h3>
            <form onSubmit={handleUpdateLoading} className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 py-6 text-xs">
              <div>
                <label className="text-slate-500 font-bold block mb-1">Linked Destination Trip (Read-only)</label>
                <input
                  type="text"
                  disabled
                  value={editingLoading.tripId}
                  className="w-full font-mono bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="text-slate-500 font-bold block mb-1">Loading Point Location Link/Description * (लोडिंग स्थान)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Warehouse Yard A, Gate 3, Sector 62, Noida"
                  value={editingLoading.loadingAddress || editingLoading.loadingPointLocation || ''}
                  onChange={(e) => setEditingLoading(prev => prev ? ({ ...prev, loadingAddress: e.target.value, loadingPointLocation: e.target.value }) : null)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="text-slate-500 font-bold block mb-1">Party / Vendor Billing Information * (पार्टी/विक्रेता की जानकारी)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Balaji Steels Pvt Ltd (GSTIN: 07AAA1111) - Mob: 9812345678"
                  value={editingLoading.loadingParty || editingLoading.partyVendorInfo || ''}
                  onChange={(e) => setEditingLoading(prev => prev ? ({ ...prev, loadingParty: e.target.value, partyVendorInfo: e.target.value }) : null)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">निर्धारित रूट (Route Details) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. NH-44 Express Way"
                    value={editingLoading.routeDetails}
                    onChange={(e) => setEditingLoading(prev => prev ? ({ ...prev, routeDetails: e.target.value }) : null)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">वजन विवरण (Weight details) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 24.5 Tons Heavy Billets"
                    value={editingLoading.weightDetails}
                    onChange={(e) => setEditingLoading(prev => prev ? ({ ...prev, weightDetails: e.target.value }) : null)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Loading Date *</label>
                  <input
                    type="date"
                    required
                    value={editingLoading.loadingDate || ''}
                    onChange={(e) => setEditingLoading(prev => prev ? ({ ...prev, loadingDate: e.target.value }) : null)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Loading Time *</label>
                  <input
                    type="time"
                    required
                    value={editingLoading.loadingTime || ''}
                    onChange={(e) => setEditingLoading(prev => prev ? ({ ...prev, loadingTime: e.target.value }) : null)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-500 font-bold block mb-1">Google Map Location *</label>
                <input
                  type="text"
                  required
                  placeholder="Paste Google Maps link, coordinates, or address"
                  value={editingLoading.googleMapLocation || ''}
                  onChange={(e) => setEditingLoading(prev => prev ? ({ ...prev, googleMapLocation: e.target.value }) : null)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="text-slate-500 font-bold block mb-1">Status (स्थिति)</label>
                <select
                  value={editingLoading.status}
                  onChange={(e) => setEditingLoading(prev => prev ? ({ ...prev, status: e.target.value as any }) : null)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-mono"
                >
                  <option value="pending">Pending (पेंडिंग)</option>
                  <option value="confirmed">Confirmed (लोड़िंग स्वीकृत / Confirm)</option>
                </select>
              </div>

              <div className="lg:col-span-2 xl:col-span-3 sticky bottom-0 z-20 -mx-6 flex gap-2 justify-end px-6 py-4 border-t border-slate-200 bg-slate-50/95 backdrop-blur">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditLoading(false);
                    setEditingLoading(null);
                  }}
                  className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!editingLoading) return;
                    setEditingLoading({
                      ...editingLoading,
                      loadingParty: editingLoading.loadingParty || editingLoading.partyVendorInfo || '',
                      loadingAddress: editingLoading.loadingAddress || editingLoading.loadingPointLocation || '',
                      partyVendorInfo: editingLoading.partyVendorInfo || editingLoading.loadingParty || '',
                      loadingPointLocation: editingLoading.loadingPointLocation || editingLoading.loadingAddress || '',
                      googleMapLocation: editingLoading.googleMapLocation || '',
                      loadingDate: editingLoading.loadingDate || '',
                      loadingTime: editingLoading.loadingTime || ''
                    });
                  }}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg cursor-pointer"
                >
                  Reset
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg cursor-pointer text-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== CREATE CONSIGNMENT MODEL DIALOG ==================== */}
      {showAddConsignment && (
        <div className="fixed inset-0 bg-slate-50 z-50 text-slate-800">
          <div className="w-full max-w-[1500px] mx-auto h-full min-h-0 overflow-y-auto px-6 py-5 text-left flex flex-col">
            <h3 className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur text-lg font-black text-slate-900 border-b border-slate-200 py-4 block">LR Creation</h3>
            <form onSubmit={handleCreateConsignment} className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 py-6 text-xs">
              <div>
                <label className="text-slate-500 font-bold block mb-1">Loading Confirmation *</label>
                <select
                  required
                  value={newConsignment.loadingConfirmationId}
                  onChange={(e) => handleSelectLoadingConfirmationForConsignment(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[11px] text-slate-800"
                >
                  <option value="">Select loading confirmation</option>
                  {loadingConfirmations
                    .filter(lc => lc.status !== 'cancelled')
                    .map(lc => (
                      <option key={lc.id} value={lc.id}>
                        {lc.loadingNo || lc.id} - {lc.vehicleNo || '-'} - {lc.loadingParty || lc.partyVendorInfo || '-'}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-slate-500 font-bold block mb-1">Link to Active Dispatch Trip (Optional)</label>
                <select
                  value={newConsignment.tripId}
                  onChange={(e) => setNewConsignment(prev => ({ ...prev, tripId: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[11px] text-slate-800"
                >
                  <option value="">-- No Direct Trip Link --</option>
                  {trips.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.vehicleNumber} - {t.driverName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Vehicle Number</label>
                  <input
                    type="text"
                    readOnly
                    value={newConsignment.vehicleNumber}
                    placeholder="Auto fetched"
                    className="w-full bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-600"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Driver Name</label>
                  <input
                    type="text"
                    readOnly
                    value={newConsignment.driverName}
                    placeholder="Auto fetched"
                    className="w-full bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-600"
                  />
                </div>
                <div>
                  <RouteSmartSearchInput
                    label="Route Details *"
                    required
                    value={newConsignment.routeDetails}
                    onChange={(value) => setNewConsignment(prev => ({ ...prev, routeDetails: value }))}
                    routeMasters={routeMasters}
                    placeholder="Auto fetched from loading"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Consignor Name (प्रेषक का नाम) *</label>
                  <input
                    type="text"
                    required
                    list="parties-list"
                    placeholder="Sender Company Name"
                    value={newConsignment.consignorName}
                    onChange={(e) => setNewConsignment(prev => ({ ...prev, consignorName: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Consignor Phone</label>
                  <input
                    type="tel"
                    placeholder="9999900000"
                    maxLength={10}
                    value={newConsignment.consignorMobile}
                    onChange={(e) => setNewConsignment(prev => ({ ...prev, consignorMobile: e.target.value.replace(/\D/g, '') }))}
                    className="w-full font-mono bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Consignee Name (प्राप्तकर्ता का नाम) *</label>
                  <input
                    type="text"
                    required
                    list="parties-list"
                    placeholder="Receiver Company Name"
                    value={newConsignment.consigneeName}
                    onChange={(e) => setNewConsignment(prev => ({ ...prev, consigneeName: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Consignee Phone</label>
                  <input
                    type="tel"
                    placeholder="9888800000"
                    maxLength={10}
                    value={newConsignment.consigneeMobile}
                    onChange={(e) => setNewConsignment(prev => ({ ...prev, consigneeMobile: e.target.value.replace(/\D/g, '') }))}
                    className="w-full font-mono bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-slate-500 font-bold block mb-1">Cargo / Material Description *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Iron Rods / Cement Bags"
                    value={newConsignment.materialDescription}
                    onChange={(e) => setNewConsignment(prev => ({ ...prev, materialDescription: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1 font-mono">Weight (Tons) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 18 Tons"
                    value={newConsignment.weightTons}
                    onChange={(e) => setNewConsignment(prev => ({ ...prev, weightTons: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Total Freight (₹ Amount) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 45000"
                    value={newConsignment.freightAmount}
                    onChange={(e) => setNewConsignment(prev => ({ ...prev, freightAmount: e.target.value }))}
                    className="w-full font-mono bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Payment Style Terms</label>
                  <select
                    value={newConsignment.paymentTerms}
                    onChange={(e) => setNewConsignment(prev => ({ ...prev, paymentTerms: e.target.value as any }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  >
                    <option value="paid">Paid (अग्रिम भुगतान)</option>
                    <option value="to_pay">To Pay (प्राप्ति पर देय)</option>
                    <option value="to_be_billed">To Be Billed (उधार/खाता)</option>
                  </select>
                </div>
              </div>

              <div className="lg:col-span-2 xl:col-span-3 sticky bottom-0 z-20 -mx-6 flex gap-2 justify-end px-6 py-4 border-t border-slate-200 bg-slate-50/95 backdrop-blur">
                <button
                  type="button"
                  onClick={() => setShowAddConsignment(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setNewConsignment({
                    tripId: '',
                    loadingConfirmationId: '',
                    lrNumber: '',
                    lrDate: '',
                    consignorName: '',
                    consignorMobile: '',
                    consigneeName: '',
                    consigneeMobile: '',
                    billingParty: '',
                    vehicleNumber: '',
                    driverName: '',
                    routeDetails: '',
                    materialDescription: '',
                    quantity: '',
                    weightTons: '',
                    freightAmount: '',
                    advanceAmount: '',
                    remarks: '',
                    paymentTerms: 'paid'
                  })}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg cursor-pointer"
                >
                  Reset
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg cursor-pointer text-xs"
                >
                  Book Cargo Receipt (LR)
                </button>
              </div>
            </form>
            <div className="mt-8 border-t border-slate-200 pt-6">
              <div className="sticky top-16 z-10 bg-slate-50/95 backdrop-blur border border-slate-200 rounded-2xl p-4 mb-4">
                <div className="flex flex-col xl:flex-row xl:items-end gap-3 justify-between">
                  <div className="flex-1">
                    <h4 className="text-sm font-black text-slate-900 mb-2">LR History</h4>
                    <input
                      type="text"
                      value={lrHistorySearch}
                      onChange={(e) => setLrHistorySearch(e.target.value)}
                      placeholder="Search LR, vehicle, driver, consignor, consignee, route..."
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ['all', 'All'],
                      ['paid', 'Paid'],
                      ['to_pay', 'To Pay'],
                      ['to_be_billed', 'To Be Billed']
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setLrHistoryFilter(value as any)}
                        className={`px-3 py-2 rounded-full text-[11px] font-bold ${lrHistoryFilter === value ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-2xl bg-white">
                <table className="min-w-[1050px] w-full text-left text-xs">
                  <thead className="text-slate-600 font-black uppercase text-[10px]">
                    <tr>
                      <th className="p-3">LR No</th>
                      <th className="p-3">Vehicle</th>
                      <th className="p-3">Driver</th>
                      <th className="p-3">Consignor</th>
                      <th className="p-3">Consignee</th>
                      <th className="p-3">Route</th>
                      <th className="p-3">Payment</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLrHistory.map(lr => (
                      <tr key={lr.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-bold">{lr.lrNumber || lr.id}</td>
                        <td className="p-3 font-mono">{lr.vehicleNumber || '-'}</td>
                        <td className="p-3">{lr.driverName || '-'}</td>
                        <td className="p-3">{lr.consignorName || '-'}</td>
                        <td className="p-3">{lr.consigneeName || '-'}</td>
                        <td className="p-3 max-w-[180px] truncate">{lr.routeDetails || '-'}</td>
                        <td className="p-3">{(lr.paymentTerms || 'paid').replace(/_/g, ' ')}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1.5">
                            <button type="button" onClick={() => setSelectedLrForPrint(lr)} className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-bold">View</button>
                            <button type="button" onClick={() => handleEditConsignmentFromList(lr)} className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 font-bold">Edit</button>
                            <button type="button" onClick={() => handleDeactivateConsignment(lr.id)} className="px-2 py-1 rounded-full bg-rose-100 text-rose-700 font-bold">Cancel</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredLrHistory.length === 0 && (
                  <div className="p-8 text-center text-sm text-slate-500">No records found</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== EDIT CONSIGNMENT MODEL DIALOG ==================== */}
      {showEditConsignment && editingConsignment && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-slate-800">
          <div className="bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 max-w-md w-full text-left">
            <h3 className="text-base font-black text-slate-900 border-b border-slate-100 pb-3 block">✏️ Edit Consignment Booking (LR Details)</h3>
            <form onSubmit={handleUpdateConsignment} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="text-slate-500 font-bold block mb-1">Linked Destination Trip (Optional)</label>
                <select
                  value={editingConsignment.tripId || ''}
                  onChange={(e) => setEditingConsignment(prev => prev ? ({ ...prev, tripId: e.target.value }) : null)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[11px] text-slate-800"
                >
                  <option value="">-- No Direct Trip Link --</option>
                  {trips.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.vehicleNumber} - {t.driverName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Consignor Name (प्रेषक का नाम) *</label>
                  <input
                    type="text"
                    required
                    list="parties-list"
                    placeholder="Sender Company Name"
                    value={editingConsignment.consignorName}
                    onChange={(e) => setEditingConsignment(prev => prev ? ({ ...prev, consignorName: e.target.value }) : null)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Consignor Phone</label>
                  <input
                    type="tel"
                    placeholder="9999900000"
                    maxLength={10}
                    value={editingConsignment.consignorMobile || ''}
                    onChange={(e) => setEditingConsignment(prev => prev ? ({ ...prev, consignorMobile: e.target.value.replace(/\D/g, '') }) : null)}
                    className="w-full font-mono bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Consignee Name (प्राप्तकर्ता का नाम) *</label>
                  <input
                    type="text"
                    required
                    list="parties-list"
                    placeholder="Receiver Company Name"
                    value={editingConsignment.consigneeName}
                    onChange={(e) => setEditingConsignment(prev => prev ? ({ ...prev, consigneeName: e.target.value }) : null)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Consignee Phone</label>
                  <input
                    type="tel"
                    placeholder="9888800000"
                    maxLength={10}
                    value={editingConsignment.consigneeMobile || ''}
                    onChange={(e) => setEditingConsignment(prev => prev ? ({ ...prev, consigneeMobile: e.target.value.replace(/\D/g, '') }) : null)}
                    className="w-full font-mono bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-slate-500 font-bold block mb-1">Cargo / Material Description *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Iron Rods / Cement Bags"
                    value={editingConsignment.materialDescription}
                    onChange={(e) => setEditingConsignment(prev => prev ? ({ ...prev, materialDescription: e.target.value }) : null)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1 font-mono">Weight (Tons) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 18 Tons"
                    value={editingConsignment.weightTons}
                    onChange={(e) => setEditingConsignment(prev => prev ? ({ ...prev, weightTons: e.target.value }) : null)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Total Freight (₹ Amount) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 45000"
                    value={editingConsignment.freightAmount}
                    onChange={(e) => setEditingConsignment(prev => prev ? ({ ...prev, freightAmount: e.target.value }) : null)}
                    className="w-full font-mono bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-bold block mb-1">Payment Style Terms</label>
                  <select
                    value={editingConsignment.paymentTerms}
                    onChange={(e) => setEditingConsignment(prev => prev ? ({ ...prev, paymentTerms: e.target.value as any }) : null)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                  >
                    <option value="paid">Paid (अग्रिम भुगतान)</option>
                    <option value="to_pay">To Pay (प्राप्ति पर देय)</option>
                    <option value="to_be_billed">To Be Billed (उधार/खाता)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-500 font-bold block mb-1">LR Booking Status</label>
                <select
                  value={editingConsignment.status}
                  onChange={(e) => setEditingConsignment(prev => prev ? ({ ...prev, status: e.target.value as any }) : null)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                >
                  <option value="active">Active (सक्रिय)</option>
                  <option value="cancelled">Cancelled (रद्द)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-500 font-bold block mb-1">Record Status</label>
                <select
                  value={editingConsignment.recordStatus || 'Active'}
                  onChange={(e) => setEditingConsignment(prev => prev ? ({ ...prev, recordStatus: e.target.value as any }) : null)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                >
                  <option value="Active">Active (सक्रिय)</option>
                  <option value="Inactive">Inactive (निष्क्रिय)</option>
                </select>
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleCancelEditConsignment()}
                  className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg cursor-pointer"
                >
                  Cancel Edit
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg cursor-pointer text-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== LR BILTY RECEIPT/INVOICE PRINT PREVIEW MODAL ==================== */}
      {selectedLrForPrint && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 overflow-y-auto px-4 py-8 flex items-center justify-center text-slate-800">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-300 relative print:p-0 print:border-0 print:shadow-none">
            
            {/* Modal Actions controls - Hidden on print media */}
            <div className="flex items-center justify-between border-b border-slate-150 pb-3 mb-4 print:hidden">
              <h3 className="text-xs font-black uppercase text-slate-800 tracking-wide flex items-center gap-2">
                <span>🖨️ Cargo Consignment note (Lorry Bilty Preview)</span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className={`px-3.5 py-1.5 ${themeDesign.primary} text-white font-extrabold text-[11px] rounded-xl cursor-pointer hover:opacity-90 active:scale-95 transition-all shadow-sm flex items-center gap-1.5`}
                >
                  <span>🖨️ Print Receipt</span>
                </button>
                <button
                  onClick={() => setSelectedLrForPrint(null)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-black rounded-xl cursor-pointer"
                >
                  Close Window
                </button>
              </div>
            </div>

            {/* HIGH-FIDELITY INVOICE BILTY CARD */}
            <div id="printable-carrier-bilty" className="p-6 bg-orange-50/10 border-2 border-double border-slate-400/80 rounded-2xl relative font-sans text-slate-850">
              
              {/* Authenticity Watermark Stamp behind */}
              <div className="absolute inset-0 flex items-center justify-center opacity-4 select-none pointer-events-none">
                <span className="text-5xl font-mono font-black border-4 border-slate-350 tracking-widest text-slate-350 px-6 py-2 rotate-12">
                  DNK ROADWAYS
                </span>
              </div>

              {/* Bilty Heading Group */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-slate-300 pb-4">
                <div className="text-left">
                  <span className="text-[10px] font-bold bg-slate-900 text-white px-2 py-0.5 rounded uppercase font-sans">MULTISTATE OPERATOR</span>
                  <h1 className="text-base font-extrabold text-slate-905 tracking-tight uppercase mt-1">DNK ROADLINES & SHIPPING INC.</h1>
                  <p className="text-[9px] text-slate-505 font-semibold leading-relaxed mt-0.5 font-sans">
                    Corporate Office: 42-B, Industrial Cargo Hub Sector, New Delhi | Support helpline: +91 11-4099-DNK
                  </p>
                </div>
                <div className="text-right sm:text-right text-xs self-stretch sm:self-auto bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-slate-450 block font-sans">CARGO CONSIGNMENT NOTE</span>
                  <div className="text-slate-850 font-mono font-black text-sm pt-0.5">LR NO: {selectedLrForPrint.id}</div>
                  <div className="text-[9px] text-slate-500 font-bold pt-0.5 font-sans">DATED: {new Date().toLocaleDateString('en-IN')}</div>
                </div>
              </div>

              {/* Consignor vs Consignee segment details row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b border-slate-200 py-4.5 text-xs text-left">
                <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/50 space-y-1">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block font-sans">CONSIGNOR (माल प्रेषक)</span>
                  <strong className="text-xs block text-slate-850 font-black">{selectedLrForPrint.consignorName}</strong>
                  {selectedLrForPrint.consignorMobile && (
                    <span className="text-[10px] text-slate-500 block font-mono">📞 Phone: {selectedLrForPrint.consignorMobile}</span>
                  )}
                  <span className="text-[9px] text-slate-400 italic block font-sans">Licensed Commercial Shipper registry record matches.</span>
                </div>

                <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/50 space-y-1">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block font-sans">CONSIGNEE (माल प्राप्तकर्ता)</span>
                  <strong className="text-xs block text-slate-850 font-black">{selectedLrForPrint.consigneeName}</strong>
                  {selectedLrForPrint.consigneeMobile && (
                    <span className="text-[10px] text-slate-500 block font-mono">📞 Phone: {selectedLrForPrint.consigneeMobile}</span>
                  )}
                  <span className="text-[9px] text-slate-400 italic block font-sans">Designated freight distribution points coordinates on site.</span>
                </div>
              </div>

              {/* Cargo / Trip Metrics details table */}
              <div className="py-4 text-xs text-left">
                <span className="text-[8px] font-black tracking-widest text-slate-400 uppercase block mb-2 font-sans">TRANSPORTS SPECIFICATIONS (परिवहन विवरण)</span>
                
                <table className="w-full border border-slate-300 divide-y divide-slate-250 text-[11px] bg-slate-50/30 rounded-xl overflow-hidden">
                  <thead className="bg-slate-100 text-[10px] font-bold uppercase text-slate-500 font-sans">
                    <tr>
                      <th className="px-3 py-2 text-left">Transit Coordinate / Details</th>
                      <th className="px-3 py-2 text-center">Net Payload (वजन)</th>
                      <th className="px-3 py-2 text-right">Freight Charges (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="px-3 py-2.8 space-y-0.5">
                        <strong className="block text-slate-850 font-extrabold">{selectedLrForPrint.materialDescription}</strong>
                        {selectedLrForPrint.tripId ? (
                          <span className="text-[9px] font-semibold text-slate-500 block">
                            🚚 Multi-axle Fleet Truck: <span className="font-mono text-indigo-750 font-extrabold">{selectedLrForPrint.tripId}</span>
                          </span>
                        ) : (
                          <span className="text-[9px] text-rose-600 block font-semibold">⚠️ Dispatch link pending vehicle loading confirmation.</span>
                        )}
                        <span className="text-[9px] font-semibold bg-indigo-50 text-indigo-800 px-1.5 py-0.5 rounded font-mono uppercase inline-block mt-1">
                          Billing TERMS: {(selectedLrForPrint.paymentTerms || 'paid').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2.8 text-center font-mono font-extrabold text-slate-800">
                        {selectedLrForPrint.weightTons} Tons
                      </td>
                      <td className="px-3 py-2.8 text-right font-mono font-black text-slate-905 text-xs">
                        ₹{Number(selectedLrForPrint.freightAmount).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Terms and Signatures column */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-5 border-t border-slate-255 text-left text-[11px] leading-relaxed">
                <div className="space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-[10px] text-slate-500 font-sans">
                  <strong className="block text-slate-700 font-extrabold">TERMS OF CARRIAGE (शर्तें):</strong>
                  <ul className="list-disc pl-3.5 space-y-0.5 font-medium leading-relaxed">
                    <li>The carrier is not responsible for transit shrinkage or atmospheric condensation.</li>
                    <li>Freight payments must strictly adhere to chosen terms ({selectedLrForPrint.paymentTerms || 'paid'}).</li>
                    <li>Claim settlements resolved only under direct Arbitration Council rules (DELHI).</li>
                  </ul>
                </div>

                <div className="flex flex-col justify-between items-end relative min-h-[90px] font-sans">
                  {/* Circular visual verification stamp */}
                  <div className="absolute right-3.5 top-0 w-22 h-22 rounded-full border-2 border-emerald-550/40 border-dashed flex items-center justify-center p-1 select-none pointer-events-none rotate-12">
                    <div className="w-full h-full rounded-full border border-emerald-555/30 flex flex-col items-center justify-center text-[7px] text-emerald-600 font-bold bg-emerald-55/10 uppercase tracking-widest text-center">
                      <span>✓ DNK ROAD</span>
                      <span className="text-[6px] font-mono">CARRIER</span>
                      <span>SECURE</span>
                    </div>
                  </div>

                  <span className="text-[9px] text-slate-400 font-bold block pr-2">FOR DNK TRANSPORT SOLUTIONS</span>
                  <div className="text-right text-[10px] font-black text-slate-700 border-t border-slate-300 w-full pt-1">
                    Authorized Signatory Seal & Stamp
                  </div>
                </div>
              </div>
            </div>
            
            <p className="text-[9px] text-slate-400 text-center mt-3 print:hidden font-sans font-medium">
              💡 Tip: Press <strong>Ctrl + P</strong> or CMD + P to export directly as a high-contrast PDF.
            </p>
          </div>
        </div>
      )}

      {/* DATALIST SUGGESTIONS FOR PARTY MASTER & ROUTE MASTER AUTOCOMPLETE */}
      <datalist id="parties-list">
        {partyMasters.map((p) => (
          <option key={p.id} value={p.partyName}>
            {p.partyMobile ? `📞 ${p.partyMobile}` : ''}
          </option>
        ))}
      </datalist>

      <datalist id="loading-points-list">
        {Array.from(new Set(routeMasters.map((r) => r.loadingPoint).filter(Boolean))).map((pt, idx) => (
          <option key={'lp_' + idx} value={pt} />
        ))}
      </datalist>

      <datalist id="unloading-points-list">
        {Array.from(new Set(routeMasters.map((r) => r.unloadingPoint).filter(Boolean))).map((pt, idx) => (
          <option key={'ulp_' + idx} value={pt} />
        ))}
      </datalist>

      {/* GLOBAL TOAST NOTIFICATION CONTAINER (IFRAME-SAFE) */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm pointer-events-none font-sans">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`p-4 rounded-xl shadow-lg border text-xs font-bold leading-relaxed flex items-center justify-between gap-3 pointer-events-auto transition-all ${
              toast.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
              toast.type === 'error' ? 'bg-rose-50 text-rose-800 border-rose-200' :
              toast.type === 'warning' ? 'bg-amber-50 text-amber-805 border-amber-200' :
              'bg-indigo-50 text-indigo-805 border-indigo-200'
            }`}
          >
            <span>{toast.message}</span>
            <button
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="text-slate-400 hover:text-slate-600 font-bold ml-1.5 focus:outline-none"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* GLOBAL REACT-BASED CONFIRMATION OVERLAY MODAL (IFRAME-SAFE) */}
      {confirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 max-w-md w-full shadow-2xl text-left space-y-4 font-sans">
            <div className="space-y-1.5">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5 border-b border-slate-100 pb-2">
                <span className="text-indigo-600">⚠️</span>
                <span>{confirmModal.title}</span>
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed pt-1.5">
                {confirmModal.message}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-extrabold text-[11px] rounded-lg tracking-wider transition-all cursor-pointer"
              >
                CANCEL (वापस जाएँ)
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-extrabold text-[11px] rounded-lg tracking-wider transition-all cursor-pointer shadow shadow-rose-100"
              >
                PROCEED (मिटाएं)
              </button>
            </div>
          </div>
        </div>
      )}
      </main>
    </div>
  );
}
