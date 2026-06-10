import type React from 'react';

export type TruckFlagStyle = {
  backgroundColor: string;
  color: string;
  borderColor: string;
};

const TRUCK_FLAG_STYLES: Record<string, TruckFlagStyle> = {
  'LOADING FIND': {
    backgroundColor: '#FEE2E2',
    color: '#991B1B',
    borderColor: '#EF4444'
  },
  LOADING: {
    backgroundColor: '#FEE2E2',
    color: '#991B1B',
    borderColor: '#EF4444'
  },
  'LOADING CONFIRM': {
    backgroundColor: '#38BDF8',
    color: '#0F172A',
    borderColor: '#0284C7'
  },
  'LOADING DONE': {
    backgroundColor: '#FFEDD5',
    color: '#9A3412',
    borderColor: '#FB923C'
  },
  RUNNING: {
    backgroundColor: '#22C55E',
    color: '#052E16',
    borderColor: '#16A34A'
  },
  'UNLOADING REPORTING': {
    backgroundColor: '#3B82F6',
    color: '#FFFFFF',
    borderColor: '#1D4ED8'
  },
  'UNLOADING DONE': {
    backgroundColor: '#60A5FA',
    color: '#0F172A',
    borderColor: '#2563EB'
  },
  'WITHOUT DRIVER': {
    backgroundColor: '#EF4444',
    color: '#FFFFFF',
    borderColor: '#DC2626'
  },
  STANDING: {
    backgroundColor: '#FACC15',
    color: '#111827',
    borderColor: '#EAB308'
  },
  MAINTENANCE: {
    backgroundColor: '#84CC16',
    color: '#1A2E05',
    borderColor: '#65A30D'
  },
  'MOVEMENT PENDING': {
    backgroundColor: '#A78BFA',
    color: '#FFFFFF',
    borderColor: '#7C3AED'
  },
  LATE: {
    backgroundColor: '#DC2626',
    color: '#FFFFFF',
    borderColor: '#991B1B'
  }
};

const DEFAULT_TRUCK_FLAG_STYLE: TruckFlagStyle = {
  backgroundColor: '#E5E7EB',
  color: '#111827',
  borderColor: '#CBD5E1'
};

export const truckFlagBadgeClassName = 'inline-flex items-center rounded-full border px-3 py-1 text-xs font-black uppercase';

export const getTruckFlagStyle = (status?: string | null): React.CSSProperties => {
  const normalizedStatus = (status || '').trim().toUpperCase();
  return TRUCK_FLAG_STYLES[normalizedStatus] || DEFAULT_TRUCK_FLAG_STYLE;
};
