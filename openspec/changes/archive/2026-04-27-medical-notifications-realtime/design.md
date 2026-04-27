# Technical Design: Medical Notifications & Real-time Sync

## Overview
Implement a real-time notification system for patients to alert them when a consultation is finalized, including direct links to their medical records (PDFs, recipes) and automatic dashboard synchronization.

## Architecture

### 1. Data Flow (Event-Driven)
1. **Trigger**: Doctor clicks "Finalizar Consulta" in the UI.
2. **Action**: `finalize-consultation` Edge Function is invoked.
3. **Processing**:
    - Update `appointments` status to `completed`.
    - Generate medical record/prescription PDFs.
    - **New**: Insert a record into the `notifications` table.
4. **Broadcast**: Supabase Realtime detects the `INSERT` and broadcasts it to the subscribed client.
5. **UI Update**: 
    - `NotificationBell` updates its badge count.
    - A toast notification appears.
    - Dashboard lists (recipes/records) trigger a re-fetch.

## Database Schema (Existing)
Table: `public.notifications`
- `id`: UUID (PK)
- `user_id`: UUID (FK profiles.id)
- `title`: TEXT
- `message`: TEXT
- `type`: TEXT (info, success, warning, error)
- `is_read`: BOOLEAN (default: false)
- `link`: TEXT (URL to the PDF or dashboard section)
- `created_at`: TIMESTAMPTZ

## Backend Changes (`finalize-consultation` Edge Function)

After the PDF upload and appointment update:
```typescript
const notificationPayload = {
  user_id: appointment.patient_id,
  title: "Consulta Finalizada",
  message: `Tu consulta con el Dr. ${doctorProfile.full_name} ha finalizado. Ya podés descargar tu receta y resumen médico.`,
  type: "success",
  link: prescriptionUrl || "/dashboard/medical-records",
};

await supabaseAdmin
  .from('notifications')
  .insert(notificationPayload);
```

## Component Design

### `NotificationBell.tsx`
- **Internal State**: `notifications[]`, `unreadCount`.
- **Props**: None (fetches its own data via Repository).
- **UI Components**:
    - `Popover` (from a headless UI or custom glassmorphism div).
    - `Bell` Icon with a floating `Badge`.
    - `ScrollArea` for the notification list.
- **Logic**:
    - Subscribe to `notifications` on mount (filtered by `auth.uid()`).
    - Mark as read on dropdown open or individual click.

### `NotificationListener.tsx` (Global)
- Headless component placed in the Root layout or Dashboard.
- Listens for NEW notifications and triggers `sonner` or `react-hot-toast`.

## Real-time Sync Logic (Dashboard)
To avoid manual refreshes, the `PatientDashboard` will use a custom hook `useNotificationSync`:
```typescript
const useNotificationSync = (refreshData: () => void) => {
  useEffect(() => {
    const channel = notificationRepository.subscribeToNotifications((payload) => {
      // If a success notification arrives, it's likely a finalized consultation
      if (payload.new.type === 'success') {
        refreshData();
      }
    });
    return () => { channel.unsubscribe(); };
  }, [refreshData]);
};
```

## Security (RLS)
- **Insert**: Only `service_role` (Edge Functions) can insert on behalf of others.
- **Select/Update**: Restricted to `auth.uid() = user_id`.

## Aesthetic Guidelines (Zen Dark)
- Notifications list: Background `bg-slate-900/50`, Backdrop Blur `10px`.
- Unread badge: Pulse animation in `emerald-500`.
- Notification items: Subtle hover effect `hover:bg-white/5`.
