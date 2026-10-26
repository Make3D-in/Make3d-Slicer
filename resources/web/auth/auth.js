// Make3D Cloud Auth Page - Complete Implementation with Preset Sync
const SUPABASE_CONFIG = {
    url: "https://mgcmgpydsuhrzesioqgy.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nY21ncHlkc3Vocnplc2lvcWd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NDQwMjEsImV4cCI6MjEwMjUyMDAyMX0.RbERZ5MZ-gSqxT05Q53dUoCeS3H9BVbeJt0FGtlPChs"
};

let currentSession = null;
let _pendingSyncSeq = null;

document.addEventListener("DOMContentLoaded", () => {
    ApplyTheme();
    try {
        const stored = sessionStorage.getItem("make3d_session") || localStorage.getItem("make3d_session");
        if (stored) {
            currentSession = JSON.parse(stored);
            if (isSessionExpired(currentSession)) { currentSession = null; clearStoredSession(); }
        }
    } catch(e) { currentSession = null; }
    updateUIState();
    window.addEventListener("message", handleNativeMessage);

    // Auto-sync: if already signed in when dialog opens, notify slicer immediately and trigger sync
    if (currentSession && currentSession.access_token) {
        notifySlicerLogin(currentSession, false);
        setTimeout(() => notifySlicerLogin(currentSession, false), 350);
        setSyncStatus("syncing", "Auto-syncing your presets...");
        setTimeout(() => {
            syncPresetsDown(true);  // true = silent auto-sync (no error popups)
        }, 1200);
    }
});

function ApplyTheme() {
    const isDark = (navigator.userAgent || "").match(/dark/i) !== null;
    document.body.classList.toggle("dark", isDark);
    document.body.classList.toggle("light", !isDark);
}

function isSessionExpired(s) { return s && s.expires_at && (Date.now() / 1000 > s.expires_at); }

function saveStoredSession(data) {
    if (!data) { clearStoredSession(); currentSession = null; return; }
    if (data.access_token && data.user) {
        if (!data.expires_at && data.expires_in) {
            data.expires_at = Math.floor(Date.now()/1000) + parseInt(data.expires_in);
        }
        currentSession = data;
        try {
            const j = JSON.stringify(data);
            localStorage.setItem("make3d_session", j);
            sessionStorage.setItem("make3d_session", j);
        } catch(e) {
            console.warn("[Make3D Auth] Storage error:", e);
        }
    }
}
function clearStoredSession() {
    try { sessionStorage.removeItem("make3d_session"); } catch(e) {}
    try { localStorage.removeItem("make3d_session"); } catch(e) {}
}

function updateUIState() {
    const isAuth = !!(currentSession && currentSession.access_token);
    document.getElementById("tab-nav").style.display = isAuth ? "none" : "flex";
    document.getElementById("login-form").style.display = isAuth ? "none" : (document.getElementById("tab-login-btn").classList.contains("active") ? "flex" : "none");
    document.getElementById("register-form").style.display = isAuth ? "none" : (document.getElementById("tab-register-btn").classList.contains("active") ? "flex" : "none");
    document.getElementById("account-dashboard").style.display = isAuth ? "flex" : "none";
    if (isAuth && currentSession.user) document.getElementById("user-email-display").textContent = currentSession.user.email || "Make3D User";
    if (isAuth) fetchPresetStats();
}

function switchTab(tab) {
    document.getElementById("tab-login-btn").classList.toggle("active", tab==="login");
    document.getElementById("tab-register-btn").classList.toggle("active", tab==="register");
    document.getElementById("login-form").style.display = tab==="login" ? "flex" : "none";
    document.getElementById("register-form").style.display = tab==="register" ? "flex" : "none";
}

function showAlert(msg, type="error") {
    const el = document.getElementById("alert-banner");
    el.textContent = msg; el.className = "alert-banner " + type; el.style.display = "block";
    if (type==="success") setTimeout(clearAlert, 5000);
}
function clearAlert() { const el = document.getElementById("alert-banner"); el.style.display = "none"; el.textContent = ""; el.className = "alert-banner"; }

async function handleLogin(e) {
    e.preventDefault(); clearAlert();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const btn = document.getElementById("btn-login-submit");
    try {
        btn.disabled = true; btn.textContent = "Signing In...";
        const res = await fetch(`${SUPABASE_CONFIG.url}/auth/v1/token?grant_type=password`, {
            method:"POST", headers:{"apikey":SUPABASE_CONFIG.anonKey,"Content-Type":"application/json"},
            body: JSON.stringify({email, password})
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error_description || data.msg || data.message || "Failed to sign in.");
        try { saveStoredSession(data); } catch(e) {}
        try { updateUIState(); } catch(e) {}
        showAlert("Signed in to Make3D Cloud!", "success");
        notifySlicerLogin(data, false);
        setTimeout(() => syncPresetsDown(), 1500);
    } catch(err) { showAlert(err.message || "Failed to sign in."); }
    finally { btn.disabled = false; btn.textContent = "Sign In"; }
}

async function handleRegister(e) {
    e.preventDefault(); clearAlert();
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    const confirm = document.getElementById("reg-password-confirm").value;
    if (password !== confirm) { showAlert("Passwords do not match."); return; }
    if (password.length < 6) { showAlert("Password must be at least 6 characters."); return; }
    const btn = document.getElementById("btn-register-submit");
    try {
        btn.disabled = true; btn.textContent = "Creating Account...";
        const res = await fetch(`${SUPABASE_CONFIG.url}/auth/v1/signup`, {
            method:"POST", headers:{"apikey":SUPABASE_CONFIG.anonKey,"Content-Type":"application/json"},
            body: JSON.stringify({email, password})
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error_description || data.msg || data.message || "Failed to create account.");
        if (data.access_token) { saveStoredSession(data); updateUIState(); showAlert("Account created and signed in!", "success"); notifySlicerLogin(data); }
        else { showAlert("Account created! Check your email to confirm, then sign in.", "success"); switchTab("login"); document.getElementById("login-email").value = email; }
    } catch(err) { showAlert(err.message || "Failed to create account."); }
    finally { btn.disabled = false; btn.textContent = "Create Make3D Account"; }
}

async function handleLogout() {
    if (!currentSession) {
        updateUIState(); clearAlert();
        postToSlicer({command:"user_logout"}); switchTab("login");
        return;
    }
    // Auto-upload presets to cloud before signing out
    try {
        setSyncStatus("syncing", "Saving your presets to cloud before sign out...");
        await syncPresetsUp(true);  // true = silent auto-sync
    } catch(e) {
        console.warn("[Make3D Auto-Sync] Upload before logout failed:", e);
    }
    clearStoredSession(); currentSession = null;
    updateUIState(); clearAlert();
    postToSlicer({command:"homepage_logout"});
    postToSlicer({command:"user_logout"});
    switchTab("login");
}

// SYNC UP: local presets -> Supabase
async function syncPresetsUp(silent = false) {
    if (!currentSession || !currentSession.access_token) {
        if (!silent) showAlert("Please sign in first.");
        return;
    }
    const btn = document.getElementById("btn-sync-up");
    if (btn) { btn.disabled = true; btn.textContent = "Uploading..."; }
    setSyncStatus("syncing", silent ? "Auto-saving presets to cloud..." : "Reading local presets...");
    _syncSilentMode = silent;
    try {
        _pendingSyncSeq = "upload_" + Date.now();
        const userId = currentSession && currentSession.user ? (currentSession.user.id || currentSession.user.email) : "";
        postToSlicer({
            command: "get_user_presets_json",
            sequence_id: _pendingSyncSeq,
            user_id: userId
        });
    } catch(e) { showAlert("Upload failed: " + e.message); if (btn) { btn.disabled=false; btn.textContent="↑ Upload Presets"; } }
}

let _syncSilentMode = false;

async function continueUpload(presets) {
    const btn = document.getElementById("btn-sync-up");
    const silent = _syncSilentMode;
    try {
        if (!presets || presets.length === 0) {
            showAlert("No local presets found. Create or customize some presets first.", "success");
            setSyncStatus("idle", "No local presets.");
            return;
        }
        setSyncStatus("syncing", "Uploading " + presets.length + " presets...");
        const userId = currentSession.user.id;
        let uploaded = 0;
        let lastError = "";

        for (const p of presets) {
            // Generate unique setting_id if not present inside preset json
            const settingId = (p.preset_data && p.preset_data.setting_id) || 
                              (p.preset_data && p.preset_data.name) || 
                              p.preset_name || 
                              (p.preset_type + "_" + Date.now());

            const payload = {
                user_id: userId,
                preset_type: p.preset_type,
                preset_name: p.preset_name,
                setting_id: settingId,
                config_json: p.preset_data || {},
                updated_at: new Date().toISOString()
            };

            const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/user_presets`, {
                method: "POST",
                headers: {
                    "apikey": SUPABASE_CONFIG.anonKey,
                    "Authorization": `Bearer ${currentSession.access_token}`,
                    "Content-Type": "application/json",
                    "Prefer": "resolution=merge-duplicates"
                },
                body: JSON.stringify(payload)
            });

            if (res.ok || res.status === 201 || res.status === 204) {
                uploaded++;
            } else {
                const errText = await res.text();
                lastError = errText;
                console.warn("[Make3D Sync] Upload row error:", res.status, errText);
            }
        }

        if (uploaded > 0) {
            if (!silent) showAlert("✓ " + uploaded + " presets uploaded to Make3D Cloud!", "success");
            setSyncStatus("online", uploaded + " presets in cloud.");
            const countEl = document.getElementById("synced-preset-count");
            if (countEl) countEl.textContent = uploaded;
            updateLastSyncTime();
        } else {
            if (!silent) showAlert("Upload failed: " + (lastError || "Could not save presets to cloud."), "error");
            setSyncStatus("error", "Upload failed.");
        }
    } catch(e) {
        showAlert("Upload failed: " + e.message, "error");
        setSyncStatus("error", "Upload failed.");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "↑ Upload Presets"; }
    }
}

// SYNC DOWN: Supabase -> local
async function syncPresetsDown(silent = false) {
    if (!currentSession || !currentSession.access_token) {
        if (!silent) showAlert("Please sign in first.");
        return;
    }
    const btn = document.getElementById("btn-sync-down");
    if (btn) { btn.disabled = true; btn.textContent = "Downloading..."; }
    setSyncStatus("syncing", silent ? "Auto-syncing presets from cloud..." : "Fetching from cloud...");
    try {
        const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/user_presets?select=*`, {
            headers: {
                "apikey": SUPABASE_CONFIG.anonKey,
                "Authorization": `Bearer ${currentSession.access_token}`
            }
        });
        if (!res.ok) throw new Error("Could not reach Make3D Cloud.");
        let rawPresets = await res.json();
        if (!rawPresets || rawPresets.length === 0) {
            if (!silent) showAlert("No cloud presets found. Upload your presets first.", "success");
            setSyncStatus("idle", "No cloud presets.");
            return;
        }
        const presets = rawPresets.map(p => ({
            preset_type: p.preset_type,
            preset_name: p.preset_name,
            preset_data: p.config_json || p.preset_data || {}
        }));
        setSyncStatus("syncing", "Writing " + presets.length + " presets to disk...");
        const countEl = document.getElementById("synced-preset-count");
        if (countEl) countEl.textContent = presets.length;
        const userId = currentSession && currentSession.user ? (currentSession.user.id || currentSession.user.email) : "";
        postToSlicer({
            command: "import_cloud_presets",
            presets: presets,
            user_id: userId
        });
        updateLastSyncTime();
        if (!silent) showAlert("✓ " + presets.length + " presets downloaded from Make3D Cloud!", "success");
        setSyncStatus("online", presets.length + " presets synced.");
    } catch(e) {
        if (!silent) showAlert("Download failed: " + e.message, "error");
        setSyncStatus("error", silent ? "Auto-sync failed." : "Download failed.");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "↓ Download Presets"; }
    }
}

function handleNativeMessage(evt) {
    try {
        let data = evt.data;
        if (typeof data === "string") data = JSON.parse(data);
        if (!data || !data.command) return;
        if (data.command === "presets_data" && data.sequence_id === _pendingSyncSeq) {
            _pendingSyncSeq = null; continueUpload(data.presets || []);
        } else if (data.command === "import_presets_done") {
            const count = data.count || 0;
            showAlert("✓ " + count + " preset profiles downloaded from Make3D Cloud!", "success");
            setSyncStatus("online", count + " presets applied.");
            updateLastSyncTime();
            const btn = document.getElementById("btn-sync-down");
            if (btn) { btn.disabled=false; btn.textContent="↓ Download Presets"; }
        }
    } catch(e) {}
}

async function fetchPresetStats() {
    if (!currentSession || !currentSession.access_token) return;
    try {
        const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/user_presets?select=id`, {
            headers:{"apikey":SUPABASE_CONFIG.anonKey,"Authorization":`Bearer ${currentSession.access_token}`}
        });
        if (res.ok) { const d = await res.json(); document.getElementById("synced-preset-count").textContent = d.length; }
    } catch(e) {}
}

function handleForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    if (!email) { showAlert("Enter your email address above first."); return; }
    fetch(`${SUPABASE_CONFIG.url}/auth/v1/recover`, {
        method:"POST", headers:{"apikey":SUPABASE_CONFIG.anonKey,"Content-Type":"application/json"},
        body: JSON.stringify({email})
    }).then(() => showAlert("Password reset email sent!", "success")).catch(() => showAlert("Failed to send reset email."));
}

function notifySlicerLogin(sessionData, closeDialog) {
    var rawStr = JSON.stringify(sessionData);
    var u = sessionData.user || {};
    var email = u.email || "";
    var uid = u.id || "";
    var displayName = email ? email.split("@")[0] : "Make3D User";

    var loginPayload = {
        command: "user_login",
        close_dialog: !!closeDialog,
        data: {
            token: sessionData.access_token,
            access_token: sessionData.access_token,
            refresh_token: sessionData.refresh_token || "",
            expires_in: sessionData.expires_in || 3600,
            expires_at: sessionData.expires_at || (Math.floor(Date.now() / 1000) + (sessionData.expires_in || 3600)),
            user_id: uid,
            user: {
                id: uid,
                uid: uid,
                name: displayName,
                account: email,
                email: email,
                avatar: ""
            },
            session_raw: rawStr
        }
    };
    postToSlicer(loginPayload);
    setTimeout(function() { postToSlicer(loginPayload); }, 400);
}

function postToSlicer(obj) {
    const msg = JSON.stringify(obj);
    console.log("[Make3D Auth] postToSlicer:", msg);
    var sent = false;
    try {
        if (window.chrome && window.chrome.webview && typeof window.chrome.webview.postMessage === 'function') {
            window.chrome.webview.postMessage(msg);
            try { window.chrome.webview.postMessage(obj); } catch(e) {}
            sent = true;
        }
    } catch(e) {
        console.warn("[Make3D Auth] chrome.webview.postMessage failed:", e);
    }
    try {
        if (window.wx && typeof window.wx.postMessage === 'function' && window.wx !== (window.chrome && window.chrome.webview)) {
            window.wx.postMessage(msg);
            try { window.wx.postMessage(obj); } catch(e) {}
            sent = true;
        }
    } catch(e) {
        console.warn("[Make3D Auth] wx.postMessage failed:", e);
    }
    if (!sent) {
        try { window.chrome.webview.postMessage(msg); } catch(e) {}
    }
}

function setSyncStatus(state, text) {
    const el = document.getElementById("sync-status-text"); if (el) el.textContent = text||"";
    const dot = document.getElementById("sync-status-dot");
    if (dot) { dot.className = "status-dot"; if (state==="syncing") dot.classList.add("syncing"); else if (state==="online") dot.classList.add("online"); else if (state==="error") dot.classList.add("error"); }
}
function updateLastSyncTime() { const el = document.getElementById("last-sync-time"); if (el) el.textContent = new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}); }
async function triggerSyncNow() { await syncPresetsDown(); }

function continueToSlicer() {
    console.log("[Make3D Auth] continueToSlicer clicked, closing dialog");
    postToSlicer({ command: "close_dialog" });
}
