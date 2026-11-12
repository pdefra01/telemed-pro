import React, { useState } from 'react';
import { Patient, User } from '../../types';
import { isAffiliate } from '../../utils/affiliate';
import { AdvisorDashboard } from './AdvisorDashboard';
import PatientDashboard from '../patient/PatientDashboard';

type View = 'commercial' | 'plan';

const STORAGE_KEY = 'advisorHomeView';

const readView = (): View => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'plan' ? 'plan' : 'commercial';
  } catch {
    return 'commercial';
  }
};

const saveView = (view: View) => {
  try {
    localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // Storage unavailable: the choice just is not remembered.
  }
};

interface Props {
  user: User;
}

/** Home of an advisor: the commercial dashboard, plus "Mi plan" when the advisor holds a plan. */
export const AdvisorHome: React.FC<Props> = ({ user }) => {
  const hasPlan = isAffiliate(user);
  const [view, setView] = useState<View>(() => (hasPlan ? readView() : 'commercial'));

  if (!hasPlan) {
    return <AdvisorDashboard user={user} />;
  }

  const select = (next: View) => {
    setView(next);
    saveView(next);
  };

  const tabClass = (active: boolean) =>
    `flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${
      active ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
    }`;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Vista del inicio" className="flex max-w-xs bg-gray-100 p-1 rounded-xl">
        <button type="button" role="tab" aria-selected={view === 'commercial'} className={tabClass(view === 'commercial')} onClick={() => select('commercial')}>
          Comercial
        </button>
        <button type="button" role="tab" aria-selected={view === 'plan'} className={tabClass(view === 'plan')} onClick={() => select('plan')}>
          Mi plan
        </button>
      </div>
      {view === 'plan' ? <PatientDashboard user={user as Patient} /> : <AdvisorDashboard user={user} />}
    </div>
  );
};
