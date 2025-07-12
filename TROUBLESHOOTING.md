# 🔧 Yasmin Alsham - Troubleshooting Guide

## 🚨 Common Next.js 15.3.4 + Turbopack Issues

### **Error: "Cannot find module '../chunks/ssr/[turbopack]_runtime.js'"**

This error typically occurs due to corrupted Turbopack cache or build artifacts.

## 🛠️ **Solution Steps (In Order)**

### **Step 1: Quick Cache Clear**
```powershell
# Stop the development server (Ctrl+C)
# Then run:
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run dev
```

### **Step 2: Complete Cache Cleanup**
```powershell
# Stop all Node.js processes
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .turbo -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force out -ErrorAction SilentlyContinue
npm run dev
```

### **Step 3: Use Safe Development Mode**
```powershell
# If Turbopack continues to have issues:
npm run dev:safe
# or
npm run dev:fallback
```

### **Step 4: Dependency Reset (Last Resort)**
```powershell
# Complete reset if all else fails:
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json -ErrorAction SilentlyContinue
npm install
npm run dev
```

## 🔍 **Root Cause Analysis**

### **Why This Error Occurs:**
1. **Turbopack Cache Corruption** - Build cache becomes inconsistent
2. **Incomplete Builds** - Server stopped during compilation
3. **File System Issues** - Antivirus or file locks
4. **Memory Issues** - Insufficient RAM during builds
5. **Port Conflicts** - Multiple Next.js instances running

### **Prevention Tips:**
- Always stop the server properly (Ctrl+C)
- Don't delete files while server is running
- Ensure sufficient disk space (>1GB free)
- Close other development servers before starting

## 🚀 **Available Scripts**

```json
{
  "dev": "next dev --turbopack",          // Default with Turbopack
  "dev:safe": "next dev",                 // Without Turbopack
  "dev:fallback": "next dev",             // Alternative startup
  "build": "next build",                  // Production build
  "start": "next start",                  // Production server
  "lint": "next lint"                     // Code linting
}
```

## 🌐 **Server Information**

- **Default Port:** 3000
- **Fallback Port:** 3001 (if 3000 is in use)
- **Local URL:** http://localhost:3000
- **Network Access:** Check terminal output for network IP

## 📱 **Project Structure**

```
yasmin-alsham/
├── src/
│   ├── app/           # Next.js App Router pages
│   ├── components/    # React components
│   ├── lib/          # Utility functions
│   └── store/        # Zustand state management
├── public/           # Static assets
├── .next/           # Build cache (auto-generated)
└── node_modules/    # Dependencies
```

## 🔧 **Emergency Recovery**

If nothing works, use the emergency recovery script:

```powershell
# Run the safe development script
.\dev-safe.ps1
```

This script will:
1. Clean all cache files
2. Verify dependencies
3. Start server with error handling
4. Provide fallback options

## 📞 **Getting Help**

If issues persist:
1. Check Node.js version: `node --version` (should be 18+)
2. Check npm version: `npm --version`
3. Verify project integrity: `npm ls`
4. Check for port conflicts: `netstat -ano | findstr :3000`

## ✅ **Success Indicators**

When everything works correctly, you should see:
```
▲ Next.js 15.3.4 (Turbopack)
- Local:        http://localhost:3000
- Network:      http://[your-ip]:3000
- Environments: .env.local

✓ Starting...
✓ Ready in [time]s
```

## 🎯 **Current Status**

✅ **Server Status:** Working correctly
✅ **Turbopack:** Enabled and functional
✅ **All Components:** Loading successfully
✅ **Arabic RTL:** Properly configured
✅ **Dependencies:** All installed and compatible
