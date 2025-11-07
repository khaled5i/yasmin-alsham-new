# Testing Guide: Red Border for Booked Time Slots

## 🐛 Bug Found and Fixed

### Root Cause
The database stores appointment times in `HH:MM:SS` format (e.g., `17:30:00`), but the frontend code was comparing against `HH:MM` format (e.g., `17:30`). This caused the comparison to fail:

```javascript
// Before fix:
bookedTimes.includes(timeSlot.time)
// '17:30:00' !== '17:30' ❌ Always false!
```

### Solution Applied
Added time normalization to remove seconds from database times:

```javascript
// After fix:
.map(appointment => {
  // Normalize time format: remove seconds if present (17:30:00 -> 17:30)
  const time = appointment.appointment_time
  return time.length > 5 ? time.substring(0, 5) : time
})
```

## 📋 Current Database State

There are **11 appointments** in the database. For testing, focus on **2025-11-08** which has:

| Time | Customer | Service |
|------|----------|---------|
| 16:00 (4:00 PM) | محمد | delivery |
| 16:45 (4:45 PM) | محمد | consultation |
| 17:30 (5:30 PM) | اختبار - موعد محجوز | consultation |
| 17:30 (5:30 PM) | محمد | consultation |
| 18:15 (6:15 PM) | مجمد | consultation |
| 20:00 (8:00 PM) | محمد | consultation |
| 21:00 (9:00 PM) | محمد | consultation |

## 🧪 How to Test

### Step 1: Open the Appointment Booking Page
1. Make sure the dev server is running: `npm run dev`
2. Open browser to: http://localhost:3001/book-appointment
3. Open browser console (F12) to see debug logs

### Step 2: Select Tomorrow's Date (2025-11-08)
1. Click on the date dropdown
2. Select the date for **November 8, 2025** (غداً)
3. Watch the console for logs

### Step 3: Verify Red Borders Appear
You should see the following time slots with **RED BORDERS**:
- ✅ **4:00** (16:00) - Red border, "محجوز" label
- ✅ **4:45** (16:45) - Red border, "محجوز" label
- ✅ **5:30** (17:30) - Red border, "محجوز" label
- ✅ **6:15** (18:15) - Red border, "محجوز" label
- ✅ **8:00** (20:00) - Red border, "محجوز" label
- ✅ **9:00** (21:00) - Red border, "محجوز" label

Available time slots (gray border):
- ⬜ **7:00** (19:00) - Gray border, clickable

### Step 4: Check Console Logs
You should see logs like:
```
🔄 Reloading appointments for date: 2025-11-08
📋 Loading appointments...
✅ Loaded 11 appointments
🔍 Total appointments in store: 11
🔍 Checking date: 2025-11-08
  ✓ Found booked appointment: 16:00:00 محمد
  ✓ Found booked appointment: 16:45:00 محمد
  ✓ Found booked appointment: 17:30:00 اختبار - موعد محجوز
  ✓ Found booked appointment: 17:30:00 محمد
  ✓ Found booked appointment: 18:15:00 مجمد
  ✓ Found booked appointment: 20:00:00 محمد
  ✓ Found booked appointment: 21:00:00 محمد
📅 Date: 2025-11-08, Booked times: ['16:00', '16:45', '17:30', '17:30', '18:15', '20:00', '21:00']
```

### Step 5: Verify Visual Styling
Booked time slots should have:
- ✅ **Red border** (`border-red-500`) - clearly visible
- ✅ **Light red background** (`bg-red-50`)
- ✅ **Red text** (`text-red-700`)
- ✅ **"محجوز" label** below the time
- ✅ **Disabled state** (not clickable)
- ✅ **Cursor: not-allowed** when hovering
- ✅ **Opacity: 75%** to make it visually distinct

### Step 6: Try to Click a Booked Slot
1. Try clicking on a red-bordered time slot
2. It should NOT be clickable
3. The cursor should show "not-allowed" icon

### Step 7: Verify Info Message
At the bottom of the time slots, you should see:
```
💡 الأوقات ذات الإطار الأحمر محجوزة مسبقاً
```

## 🔧 Utility Scripts

### List All Appointments
```bash
node scripts/list-appointments.js
```

### Create Test Appointment
```bash
node scripts/create-test-appointment.js
```
This creates a test appointment for tomorrow at 5:30 PM.

### Delete Test Appointment
```bash
node scripts/delete-test-appointment.js <appointment-id>
```

## 🎨 Visual Comparison

### Before Fix
- Time slots appeared normal (gray border)
- No visual indication of booked slots
- Users could click and get error message

### After Fix
- **Booked slots: RED BORDER** (`border-red-500`)
- **"محجوز" label** clearly visible
- **Disabled and not clickable**
- **Info message** explains the red border

## ✅ Expected Behavior

1. **On page load**: Appointments are fetched from Supabase
2. **When date selected**: Appointments are reloaded
3. **Time slots display**:
   - Available: Gray border, white background, clickable
   - Selected: Pink border, pink background
   - **Booked: RED BORDER, red background, disabled**
4. **Console logs**: Show which appointments are found
5. **Loading state**: Shows spinner while fetching data

## 🚨 Troubleshooting

### If red borders don't appear:

1. **Check browser console for errors**
   - Open DevTools (F12)
   - Look for JavaScript errors

2. **Verify appointments are loaded**
   - Check console logs for "✅ Loaded X appointments"
   - Run `node scripts/list-appointments.js` to verify database

3. **Clear browser cache**
   - Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
   - Or clear cache in DevTools

4. **Restart dev server**
   - Stop server (Ctrl+C)
   - Run `npm run dev` again

5. **Check Supabase connection**
   - Verify `.env.local` has correct credentials
   - Check network tab for API calls to Supabase

6. **Inspect HTML elements**
   - Right-click on a time slot
   - Select "Inspect Element"
   - Check if classes include `border-red-500`

## 📝 Files Modified

- ✅ `src/app/book-appointment/page.tsx` - Fixed time format normalization (line 150-153)

## 🎯 Success Criteria

- [x] Red border appears on booked time slots
- [x] "محجوز" label shows on booked slots
- [x] Booked slots are not clickable
- [x] Info message explains red border meaning
- [x] Loading state shows while fetching
- [x] Console logs show appointments being loaded
- [x] Time format mismatch fixed (HH:MM:SS → HH:MM)

