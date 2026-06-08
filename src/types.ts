export type UserRole = 'driver' | 'operations' | 'admin';

export interface AppUser {
  uid: string;
  name: string;
  mobile: string;
  role: UserRole;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface DriverMaster {
  id: string; // matches document ID
  driverCode: string;
  name: string;
  mobile: string;
  alternateMobile: string;
  address: string;
  aadhaarNumber: string;
  panNumber: string;
  drivingLicenceNumber: string;
  licenceExpiryDate: string;
  joiningDate: string;
  driverStatus: 'available' | 'on_trip' | 'inactive';
  aadhaarDocUrl?: string; // base64
  panDocUrl?: string; // base64
  licenceDocUrl?: string; // base64
  linkedVehicleId?: string;
  linkedVehicleNumber?: string;
  createdAt: string;
  recordStatus?: 'Active' | 'Inactive';
}



export type TripStatus =
  | 'assigned'
  | 'inspected'
  | 'loading_started'
  | 'loaded'
  | 'movement_pending'
  | 'running'
  | 'unloading_started'
  | 'delivered'
  | 'pod_uploaded'
  | 'completed';

export interface TripAssignment {
  id: string;
  vehicleNumber: string;
  driverId: string;
  driverName: string;
  loadingPoint: string;
  unloadingPoint: string;
  status: TripStatus;
  assignedDate: string;
  eta: string;
  currentLat?: number;
  currentLng?: number;
  lastLocationTime?: string;
  startKm?: number;
  currentKm?: number;
  expectedUnloadingDate?: string;
  updatedAt?: string;
  recordStatus?: 'Active' | 'Inactive';
}

export interface VehicleInspection {
  id: string;
  tripId: string;
  vehicleNumber: string;
  driverId: string;
  driverName: string;
  odometerReading: number;
  checklist: {
    engineOil: boolean;
    coolantWater: boolean;
    brakeOil: boolean;
    clutchOil: boolean;
    powerSteeringOil: boolean;
    batteryCondition: boolean;
    headLights: boolean;
    indicators: boolean;
    horn: boolean;
    tyresCondition: boolean;
    stepneyAvailable: boolean;
    toolKitAvailable: boolean;
    jackAvailable: boolean;
    fireExtinguisher: boolean;
    firstAidBox: boolean;
  };
  frontPhotoUrl?: string; // base64
  backPhotoUrl?: string; // base64
  leftPhotoUrl?: string; // base64
  rightPhotoUrl?: string; // base64
  odometerPhotoUrl?: string; // base64
  digitalSignatureUrl?: string; // base64
  driverDeclarationAccepted: boolean;
  inspectedAt: string;
}

export type MovementEventType =
  | 'reached_loading'
  | 'loading_start'
  | 'loading_complete'
  | 'journey_start'
  | 'delay_reported'
  | 'reached_unloading'
  | 'unloading_start'
  | 'unloading_complete';

export interface TripMovement {
  id: string;
  tripId: string;
  eventType: MovementEventType;
  timestamp: string;
  photoUrl?: string; // base64
  voiceUrl?: string; // base64 audio
  delayReason?: string;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  recordedBy: string;
}

export interface MaintenanceTicket {
  id: string;
  vehicleNumber: string;
  driverId: string;
  driverName: string;
  issueType: 'tyre' | 'battery' | 'engine' | 'oil' | 'light' | 'other';
  problemDescription: string;
  photoUrl?: string; // base64
  voiceUrl?: string; // base64 audio
  status: 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed';
  location?: {
    latitude: number;
    longitude: number;
  };
  createdAt: string;
}

export interface PodUpload {
  id: string; // tripId
  tripId: string;
  podPhotoUrl: string; // base64
  receiverName: string;
  receiverMobile: string;
  receiverSignatureUrl: string; // base64 drawing
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  uploadedAt: string;
}

export interface Notification {
  id: string;
  tripId?: string;
  type: 'sos' | 'delay' | 'breakdown' | 'info';
  title: string;
  message: string;
  timestamp: string;
  vehicleNumber?: string;
  driverName?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  isRead: boolean;
}

export interface LoadingConfirmation {
  id: string; // confirmationId
  tripId: string;
  loadingNo?: string; // Auto Generated
  vehicleNo?: string;
  vehicleType?: string;
  driverName?: string;
  driverMobile?: string;
  loadingParty?: string;
  loadingAddress?: string;
  loadingContactPerson?: string;
  loadingMobile?: string;
  googleMapLocation?: string;
  loadingDate?: string;
  loadingTime?: string;
  remarks?: string;
  partyType?: 'CLIENT' | 'BROKER';
  placeCity?: string;
  isLoadingConfirmed: boolean;
  status: 'pending' | 'confirmed' | 'cancelled';
  updatedAt?: string;
  createdAt: string;

  // Keep old fields for backward compatibility
  loadingPointLocation?: string;
  partyVendorInfo?: string;
  routeDetails?: string;
  weightDetails?: string;
  recordStatus?: 'Active' | 'Inactive';
}

export interface Consignment {
  id: string; // matches document ID / lrNumber
  tripId: string;
  loadingConfirmationId?: string;
  lrNumber?: string;
  lrDate?: string;
  consignorName: string;
  consigneeName: string;
  billingParty?: string;
  vehicleNumber?: string;
  driverName?: string;
  routeDetails?: string;
  materialDescription: string;
  quantity?: string;
  weightTons: string; // Weight
  freightAmount: string; // Freight
  advanceAmount?: string; // Advance
  remarks?: string;
  status: 'active' | 'cancelled';
  createdAt: string;

  // Keep old compat fields
  consignorMobile?: string;
  consigneeMobile?: string;
  paymentTerms?: 'paid' | 'to_pay' | 'to_be_billed';
  recordStatus?: 'Active' | 'Inactive';
}

export interface CourierHistoryItem {
  id: string;
  courierCompany: string;
  docketNumber: string;
  dispatchDate: string;
  dispatchTime: string;
  documentsSent: 'Yes' | 'No';
  receivedDate?: string;
  receivedTime?: string;
  receivedBy?: string;
  sentBy?: string;
  receiverName?: string;
  remarks?: string;
}

export interface PartyMaster {
  id: string;
  partyName: string;
  partyType: 'CLIENT' | 'BROKER';
  broker?: string;
  contactPerson: string;
  mobileNumber: string;
  alternateMobileNumber?: string;
  email?: string;
  additionalContacts?: Array<{
    id: string;
    name: string;
    mobile: string;
    email: string;
  }>;
  gstNumber?: string;
  panNumber?: string;
  billingAddress?: string;
  placeCity: string;
  state?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'BLACKLISTED';
  courierHistory?: CourierHistoryItem[];
  createdAt: string;
  // Keep old compat fields
  partyMobile?: string;
  address?: string;
  recordStatus?: 'Active' | 'Inactive';
}

export interface RouteMaster {
  id: string; // document id
  routeCode: string; // e.g. RT0001
  routeName: string;
  fromCity: string;
  toCity: string;
  viaRoute?: string;
  distanceKm: number;
  transitHours: number;
  active: boolean;
  createdAt: string;
  // Optional calculated fields for integration
  eta?: string; // stored as ISO string or human label
  reportingTime?: string; // ISO string when ETA triggers reporting rule
  // Back-compat fields
  loadingPoint?: string;
  unloadingPoint?: string;
  recordStatus?: 'Active' | 'Inactive';
}

export interface Movement {
  id: string; // matches document ID / movementNumber
  movementNumber: string;
  vehicleNumber: string;
  driverName: string;
  route: string;
  loadingPoint: string;
  unloadingPoint: string;
  startDate: string;
  startTime: string;
  startKm: string;
  advanceAmount: string;
  fuelIssued: string;
  expectedArrivalDate: string;
  expectedArrivalTime: string;
  googleMapDestination: string;
  tripId: string;
  createdAt: string;
}

export interface VehicleMaster {
  id: string; // matches document ID
  vehicleNumber: string;
  vehicleType: string;
  ownershipType: 'owned' | 'attached';
  ownerName: string;
  ownerMobile: string;
  chassisNumber: string;
  engineNumber: string;
  capacity: string;
  rcUrl?: string; // base64
  insuranceUrl?: string; // base64
  fitnessUrl?: string; // base64
  permitUrl?: string; // base64
  pucUrl?: string; // base64
  rcExpiry: string;
  insuranceExpiry: string;
  fitnessExpiry: string;
  permitExpiry: string;
  pucExpiry: string;
  statusFlag?: 'LOADING FIND' | 'LOADING CONFIRM' | 'LOADING DONE' | 'MOVEMENT PENDING' | 'RUNNING' | 'LATE' | 'UNLOADING REPORTING' | 'UNLOADING DONE';
  linkedDriverId?: string;
  linkedDriverName?: string;
  createdAt: string;
  recordStatus?: 'Active' | 'Inactive';
}
