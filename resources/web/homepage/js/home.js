
// Theme detection - syncs with app dark/light mode
function ApplyAppTheme() {
    var isDark = true; // default dark
    try {
        // globalapi.js sets dark mode based on userAgent containing 'dark'
        var ua = navigator.userAgent || "";
        isDark = ua.match(/dark/i) !== null;
    } catch(e) {}
    
    if (isDark) {
        document.body.classList.remove('light');
        document.body.classList.add('dark');
    } else {
        document.body.classList.remove('dark');
        document.body.classList.add('light');
    }
}

// Make3D Slicer Modern Homepage Logic & Web Bridge

var g_RightBtnFilePath = '';
var g_RecentFiles = [];

// Base Bridge Messaging to C++
function SendWXMessage(strMsg) {
    console.log("[Make3D Web Bridge] SendWXMessage:", strMsg);
    var sent = false;

    // 1. Try window.wx.postMessage
    try {
        if (window.wx && typeof window.wx.postMessage === 'function') {
            window.wx.postMessage(strMsg);
            sent = true;
        }
    } catch(e) {
        console.warn("[Make3D Web Bridge] wx.postMessage failed:", e);
    }

    // 2. Try window.chrome.webview.postMessage
    if (!sent) {
        try {
            if (window.chrome && window.chrome.webview && typeof window.chrome.webview.postMessage === 'function') {
                window.chrome.webview.postMessage(strMsg);
                sent = true;
            }
        } catch(e) {
            console.warn("[Make3D Web Bridge] chrome.webview.postMessage failed:", e);
        }
    }

    // 3. Fallback direct call
    if (!sent) {
        try {
            window.wx.postMessage(strMsg);
        } catch(e) {}
    }
}

function SendSimpleCommand(cmdName) {
    var payload = {
        "sequence_id": String(Math.floor(Date.now() / 1000)),
        "command": cmdName
    };
    SendWXMessage(JSON.stringify(payload));
}

// Button Click Handlers
function OnClickNewProject() {
    console.log("[Make3D Home] Clicked New Project");
    SendSimpleCommand("homepage_newproject");
}

function OnClickOpenProject() {
    console.log("[Make3D Home] Clicked Open Project");
    SendSimpleCommand("homepage_openproject");
}

function OnLoginOrRegister() {
    console.log("[Make3D Home] Clicked Login / Register");
    SendSimpleCommand("homepage_login_or_register");
}

function OnOpenCloudSync() {
    console.log("[Make3D Home] Open Cloud Presets / Sync Dialog");
    SendSimpleCommand("homepage_login_or_register");
}

function OnLogOut() {
    console.log("[Make3D Home] Clicked Log Out");
    try {
        localStorage.removeItem("make3d_session");
        sessionStorage.removeItem("make3d_session");
    } catch(e) {}
    SetUserOffline();
    SendSimpleCommand("homepage_logout");
}

function OpenUrlInLocalBrowser(url) {
    console.log("[Make3D Home] Open URL:", url);
    var payload = {
        "sequence_id": String(Math.floor(Date.now() / 1000)),
        "command": "open_url_in_local_browser",
        "data": {
            "url": url
        }
    };
    SendWXMessage(JSON.stringify(payload));
}

function GotoMenu(menuName) {
    console.log("[Make3D Home] GotoMenu:", menuName);
}

// Recent Files Management
function SendMsg_GetRecentFile() {
    SendSimpleCommand("get_recent_projects");
}

function OnOpenRecentFile(filePath) {
    console.log("[Make3D Home] Opening recent file:", filePath);
    var payload = {
        "sequence_id": String(Math.floor(Date.now() / 1000)),
        "command": "homepage_open_recentfile",
        "data": {
            "path": decodeURIComponent(filePath)
        }
    };
    SendWXMessage(JSON.stringify(payload));
}

function OnDeleteRecentFile() {
    $("#recnet_context_menu").hide();
    if (!g_RightBtnFilePath) return;

    var payload = {
        "sequence_id": String(Math.floor(Date.now() / 1000)),
        "command": "homepage_delete_recentfile",
        "data": {
            "path": g_RightBtnFilePath
        }
    };
    SendWXMessage(JSON.stringify(payload));
    SendMsg_GetRecentFile();
}

function OnDeleteAllRecentFiles() {
    $("#recnet_context_menu").hide();
    SendSimpleCommand("homepage_delete_all_recentfile");
    $('#FileList').empty();
    $('#EmptyRecentState').show();
    $('#RecentClearAllBtn').hide();
    $('#RecentCountBadge').text('0 files');
}

function OnContextOpenProject() {
    $("#recnet_context_menu").hide();
    if (g_RightBtnFilePath) {
        OnOpenRecentFile(g_RightBtnFilePath);
    }
}

function OnExploreRecentFile() {
    $("#recnet_context_menu").hide();
    if (!g_RightBtnFilePath) return;

    var payload = {
        "sequence_id": String(Math.floor(Date.now() / 1000)),
        "command": "homepage_explore_recentfile",
        "data": {
            "path": decodeURIComponent(g_RightBtnFilePath)
        }
    };
    SendWXMessage(JSON.stringify(payload));
}

// Render Recent Projects in UI
function ShowRecentList(recentList) {
    if (!Array.isArray(recentList)) {
        try {
            recentList = JSON.parse(recentList);
        } catch(e) {
            recentList = [];
        }
    }

    g_RecentFiles = recentList || [];
    var $list = $('#FileList');
    $list.empty();

    if (!recentList || recentList.length === 0) {
        $('#EmptyRecentState').show();
        $('#RecentClearAllBtn').hide();
        $('#RecentCountBadge').text('0 files');
        return;
    }

    $('#EmptyRecentState').hide();
    $('#RecentClearAllBtn').show();
    $('#RecentCountBadge').text(recentList.length + ' file' + (recentList.length > 1 ? 's' : ''));

    recentList.forEach(function(item) {
        var filePath = item.path || '';
        var fileName = filePath.split(/[\\/]/).pop() || filePath;
        var fileTime = item.time || '';
        var coverImg = item.image || item.cover || item.thumbnail || 'img/d.png';

        var cardHtml = '<div class="file-item-card" fpath="' + encodeURIComponent(filePath) + '">' +
            '<div class="file-thumb-box"><img src="' + coverImg + '" class="file-thumb-img" onerror="this.src=\'img/d.png\'"/></div>' +
            '<div class="file-meta">' +
                '<div class="file-name-text" title="' + filePath + '">' + fileName + '</div>' +
                '<div class="file-date-text">' + fileTime + '</div>' +
            '</div>' +
        '</div>';

        $list.append(cardHtml);
    });

    // Bind item click and right click
    $('.file-item-card').off('mousedown').on('mousedown', function(e) {
        var rawPath = $(this).attr('fpath');
        g_RightBtnFilePath = decodeURIComponent(rawPath);

        if (e.which === 3) {
            // Right click: show context menu
            e.preventDefault();
            $('#recnet_context_menu').css({
                top: e.pageY + 'px',
                left: e.pageX + 'px'
            }).show();
        } else if (e.which === 1) {
            // Left click: open file
            OnOpenRecentFile(rawPath);
        }
    });
}

// User Profile & Status Sync
function SetLoginInfo(avatar, username) {
    if (username && String(username).trim() !== '' && String(username).trim() !== 'undefined' && String(username).trim() !== 'Guest User') {
        var displayName = String(username).trim();
        // Truncate long email addresses gracefully
        if (displayName.indexOf('@') !== -1) {
            displayName = displayName.split('@')[0];
        }
        if (displayName.length > 20) {
            displayName = displayName.substring(0, 18) + '...';
        }
        var nickEl = document.getElementById('UserNickName');
        if (nickEl) nickEl.textContent = displayName;
        
        // Show real avatar if available, else show SVG fallback
        var imgEl = document.getElementById('UserAvatarImg');
        var svgEl = document.getElementById('UserAvatarSvg');
        if (avatar && String(avatar).trim() !== '' && String(avatar).trim() !== 'undefined') {
            if (imgEl) { imgEl.src = avatar; imgEl.style.display = 'block'; }
            if (svgEl) svgEl.style.display = 'none';
        } else {
            if (imgEl) imgEl.style.display = 'none';
            if (svgEl) svgEl.style.display = 'flex';
        }
        
        // Force display with priority
        var lb = document.getElementById('LoginBlock');
        var ob = document.getElementById('LogoutBlock');
        if (lb) lb.style.setProperty('display', 'none', 'important');
        if (ob) ob.style.setProperty('display', 'flex', 'important');
    } else {
        SetUserOffline();
    }
}

function SetUserOffline() {
    var nickEl = document.getElementById('UserNickName');
    if (nickEl) nickEl.textContent = 'Guest User';
    var imgEl = document.getElementById('UserAvatarImg');
    var svgEl = document.getElementById('UserAvatarSvg');
    if (imgEl) imgEl.style.display = 'none';
    if (svgEl) svgEl.style.display = 'flex';
    var lb = document.getElementById('LoginBlock');
    var ob = document.getElementById('LogoutBlock');
    if (ob) ob.style.setProperty('display', 'none', 'important');
    if (lb) lb.style.setProperty('display', 'flex', 'important');
}

function SetLoginPanelVisibility(visible) {
    if (visible) {
        $('#LeftBoard').show();
    }
}

// Unified C++ to JS Dispatcher

// ══════════════════════════════════════════════════════════════════════════
// Make3D Cloud Auto-Sync (runs in homepage WebView - always alive)
// ══════════════════════════════════════════════════════════════════════════
var SUPABASE_URL = "https://mgcmgpydsuhrzesioqgy.supabase.co";
var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nY21ncHlkc3Vocnplc2lvcWd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NDQwMjEsImV4cCI6MjEwMjUyMDAyMX0.RbERZ5MZ-gSqxT05Q53dUoCeS3H9BVbeJt0FGtlPChs";

// Throttle: avoid spamming uploads (wait 3 seconds after last save)
var _uploadTimer = null;

// ── Auto-Download on startup/login ────────────────────────────────────────
function AutoDownloadFromCloud() {
    try {
        var raw = localStorage.getItem("make3d_session") || sessionStorage.getItem("make3d_session");
        if (!raw) return;
        var session = JSON.parse(raw);
        if (!session || !session.access_token) return;
        if (session.expires_at && (Date.now() / 1000) > session.expires_at) return;
        var userId = (session.user && (session.user.id || session.user.uid)) ? (session.user.id || session.user.uid) : "";
        console.log("[Make3D AutoSync] Auto-downloading presets from cloud...");
        fetch(SUPABASE_URL + "/rest/v1/user_presets?select=*", {
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": "Bearer " + session.access_token
            }
        }).then(function(r) {
            return r.json();
        }).then(function(rows) {
            if (!rows || !rows.length) { console.log("[Make3D AutoSync] No cloud presets found."); return; }
            var presets = rows.map(function(p) {
                return {
                    preset_type: p.preset_type,
                    preset_name: p.preset_name,
                    preset_data: p.config_json || p.preset_data || {}
                };
            });
            console.log("[Make3D AutoSync] Importing " + presets.length + " presets from cloud");
            SendWXMessage(JSON.stringify({
                command: "import_cloud_presets",
                presets: presets,
                user_id: userId
            }));
        }).catch(function(e) {
            console.warn("[Make3D AutoSync] Download failed:", e);
        });
    } catch(e) {
        console.warn("[Make3D AutoSync] AutoDownloadFromCloud error:", e);
    }
}

// ── Auto-Upload (called after preset save) ───────────────────────────────
function TriggerAutoUpload() {
    // Debounce: wait 3s after last trigger to avoid spamming
    if (_uploadTimer) clearTimeout(_uploadTimer);
    _uploadTimer = setTimeout(function() {
        _uploadTimer = null;
        DoAutoUpload();
    }, 3000);
}

function DoAutoUpload() {
    try {
        var raw = localStorage.getItem("make3d_session") || sessionStorage.getItem("make3d_session");
        if (!raw) return;
        var session = JSON.parse(raw);
        if (!session || !session.access_token) return;
        if (session.expires_at && (Date.now() / 1000) > session.expires_at) return;
        var userId = (session.user && (session.user.id || session.user.uid)) ? (session.user.id || session.user.uid) : "";
        console.log("[Make3D AutoSync] Auto-uploading presets to cloud...");
        // Ask C++ for the local preset JSON, then upload
        var seqId = "autosync_" + Date.now();
        _pendingAutoUploadSeq = seqId;
        _pendingAutoUploadSession = session;
        SendWXMessage(JSON.stringify({
            command: "get_user_presets_json",
            sequence_id: seqId,
            user_id: userId
        }));
    } catch(e) {
        console.warn("[Make3D AutoSync] DoAutoUpload error:", e);
    }
}

var _pendingAutoUploadSeq = null;
var _pendingAutoUploadSession = null;

// Upload presets received from C++ to Supabase
function UploadPresetsToCloud(presets, session) {
    if (!presets || !presets.length || !session) return;
    var userId = (session.user && (session.user.id || session.user.uid)) ? (session.user.id || session.user.uid) : "";
    var uploaded = 0;
    var total = presets.length;

    presets.forEach(function(p) {
        var preset_type = p.preset_type || "";
        var preset_name = p.preset_name || "";
        var config_json = p.preset_data || {};
        // Build a stable setting_id
        var setting_id = (userId + "_" + preset_type + "_" + preset_name).replace(/[^a-zA-Z0-9_\-]/g, "_");

        fetch(SUPABASE_URL + "/rest/v1/user_presets", {
            method: "POST",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": "Bearer " + session.access_token,
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal"
            },
            body: JSON.stringify({
                user_id: userId,
                preset_type: preset_type,
                preset_name: preset_name,
                setting_id: setting_id,
                config_json: config_json
            })
        }).then(function(r) {
            uploaded++;
            if (uploaded === total) {
                console.log("[Make3D AutoSync] Uploaded " + uploaded + " presets to cloud");
            }
        }).catch(function(e) {
            console.warn("[Make3D AutoSync] Upload preset failed:", preset_name, e);
        });
    });
}

function HandleStudio(data) {
    console.log("[Make3D Web Bridge] Received from C++:", data);
    var obj = data;
    if (typeof data === 'string') {
        try {
            obj = JSON.parse(data);
        } catch(e) {
            return;
        }
    }
    if (!obj || !obj.command) return;

    var cmd = obj.command;
    if (cmd === 'get_recent_projects' || cmd === 'recent_projects_response') {
        ShowRecentList(obj.response || obj.data || []);
    } else if (cmd === 'get_login_info' || cmd === 'login_info_response' || cmd === 'user_login') {
        if (obj.session_raw) {
            try {
                var sStr = typeof obj.session_raw === 'string' ? obj.session_raw : JSON.stringify(obj.session_raw);
                localStorage.setItem("make3d_session", sStr);
                sessionStorage.setItem("make3d_session", sStr);
            } catch(e) {}
        }
        var targetName = obj.name || obj.nickname || obj.user_name || obj.email;
        if (obj.is_login || obj.login || (targetName && targetName.trim() !== '' && targetName.trim() !== 'Guest User')) {
            SetLoginInfo(obj.avatar, targetName);
        } else {
            var raw = localStorage.getItem("make3d_session") || sessionStorage.getItem("make3d_session");
            if (!raw) {
                SetUserOffline();
            }
        }
    } else if (cmd === 'orca_userlogin') {
        if (obj.data) {
            SetLoginInfo(obj.data.avatar, obj.data.name);
        }
    }
    // ── Make3D Auto-Sync handlers ──────────────────────────────────────────
    else if (cmd === 'trigger_cloud_download') {
        // C++ triggers this on user_login to auto-download
        AutoDownloadFromCloud();
    }
    else if (cmd === 'trigger_cloud_upload') {
        // C++ triggers this when a preset is saved
        TriggerAutoUpload();
    }
    else if (cmd === 'presets_data') {
        // Response to get_user_presets_json - handle auto-upload
        if (obj.sequence_id && _pendingAutoUploadSeq && obj.sequence_id === _pendingAutoUploadSeq) {
            _pendingAutoUploadSeq = null;
            var session = _pendingAutoUploadSession;
            _pendingAutoUploadSession = null;
            if (obj.presets && obj.presets.length > 0 && session) {
                UploadPresetsToCloud(obj.presets, session);
            }
        }
    }
}

// Global Message Listener for C++
window.postMessage = HandleStudio;
window.addEventListener('message', function(e) {
    if (e.data) {
        HandleStudio(e.data);
    }
});

// Document Click for Context Menu Dismiss
$(document).on('click', function(e) {
    if (!$(e.target).closest('#recnet_context_menu').length) {
        $('#recnet_context_menu').hide();
    }
});

$(document).on('contextmenu', function(e) {
    if (!$(e.target).closest('.file-item-card').length) {
        $('#recnet_context_menu').hide();
    }
    return false;
});

// Page Initialization

// ── Make3D Cloud: Supabase session sync ──────────────────────────────────
// The auth dialog stores the session in localStorage as "make3d_session"
// We read it here to show the user's name/status on the homepage sidebar.
function CheckSupabaseSession() {
    try {
        var raw = localStorage.getItem("make3d_session") || sessionStorage.getItem("make3d_session");
        if (!raw) {
            return;
        }
        var session = JSON.parse(raw);
        if (!session || !session.access_token) { return; }
        // Check expiry
        if (session.expires_at && (Date.now() / 1000) > session.expires_at) {
            return;
        }
        // User is logged in via Supabase
        var email = (session.user && session.user.email) ? session.user.email : "";
        var displayName = email.indexOf("@") !== -1 ? email.split("@")[0] : email;
        if (!displayName && session.user && session.user.name) displayName = session.user.name;
        if (!displayName) displayName = "Make3D User";
        SetLoginInfo("", displayName);
        var userId = (session.user && (session.user.id || session.user.uid)) ? (session.user.id || session.user.uid) : "";
        if (userId) {
            SendWXMessage(JSON.stringify({
                command: "homepage_check_user",
                user_id: userId,
                user_name: displayName,
                email: email
            }));
        }
    } catch(e) {
        console.log("[Make3D Home] CheckSupabaseSession error:", e);
    }
}

function OnInit() {
    console.log("[Make3D Home] OnInit loaded");
    ApplyAppTheme();
    if (typeof TranslatePage === 'function') {
        try { TranslatePage(); } catch(e) {}
    }
    try { if (typeof SwitchDarkMode === 'function') { SwitchDarkMode('../css/dark.css'); } } catch(e) {}
    // Check Supabase session first (our Make3D Cloud login)
    CheckSupabaseSession();
    // Also check legacy Orca cloud agent
    SendSimpleCommand("get_login_info");
    SendMsg_GetRecentFile();
    // Re-check after 2s in case auth dialog just closed
    setTimeout(CheckSupabaseSession, 2000);
    // Auto-download cloud presets on startup if already signed in
    setTimeout(AutoDownloadFromCloud, 3000);
}

// Auto-sync when window regains focus (e.g. after login dialog closes)
window.addEventListener('focus', function() {
    CheckSupabaseSession();
    SendSimpleCommand("get_login_info");
});

window.addEventListener('storage', function(e) {
    if (e.key === 'make3d_session') {
        CheckSupabaseSession();
    }
});

// Periodic check: if still showing Guest User, poll C++ and localStorage
setInterval(function() {
    if ($('#LoginBlock').is(':visible')) {
        CheckSupabaseSession();
        SendSimpleCommand("get_login_info");
    }
}, 2500);
