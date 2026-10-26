#include "WebUserLoginDialog.hpp"

#include <string.h>
#include "I18N.hpp"
#include "libslic3r/AppConfig.hpp"
#include "libslic3r/Utils.hpp"
#include "slic3r/GUI/wxExtensions.hpp"
#include "slic3r/GUI/GUI_App.hpp"
#include "slic3r/Utils/NetworkAgent.hpp"
#include "libslic3r_version.h"

#include <wx/sizer.h>
#include <wx/toolbar.h>
#include <wx/textdlg.h>

#include <wx/wx.h>
#include <wx/fileconf.h>
#include <wx/file.h>
#include <wx/wfstream.h>

#include <boost/cast.hpp>
#include <boost/asio.hpp>
#include <boost/algorithm/string/replace.hpp>
#include <boost/lexical_cast.hpp>

#include <nlohmann/json.hpp>
#include "MainFrame.hpp"
#include <boost/dll.hpp>
#include <boost/filesystem.hpp>

#include <sstream>
#include <fstream>
#include <slic3r/GUI/Widgets/WebView.hpp>
#include <slic3r/GUI/Widgets/HyperLink.hpp> // ORCA
using namespace std;

using namespace nlohmann;

namespace Slic3r { namespace GUI {

#define NETWORK_OFFLINE_TIMER_ID 10001

BEGIN_EVENT_TABLE(ZUserLogin, wxDialog)
EVT_TIMER(NETWORK_OFFLINE_TIMER_ID, ZUserLogin::OnTimer)
END_EVENT_TABLE()

int ZUserLogin::web_sequence_id = 20000;

namespace {

int reserve_loopback_port()
{
    try {
        boost::asio::io_service       io_service;
        boost::asio::ip::tcp::acceptor acceptor(io_service, {boost::asio::ip::tcp::v4(), 0});
        return static_cast<int>(acceptor.local_endpoint().port());
    } catch (...) {
        return 0;
    }
}

std::string rewrite_loopback_url(std::string url, int port)
{
    if (port <= 0) {
        return url;
    }

    const std::string old_port = std::to_string(LOCALHOST_PORT);
    const std::string new_port = std::to_string(port);

    boost::replace_all(url, std::string(LOCALHOST_URL) + old_port, std::string(LOCALHOST_URL) + new_port);
    boost::replace_all(url, "http://127.0.0.1:" + old_port, "http://127.0.0.1:" + new_port);
    boost::replace_all(url, "http%3A%2F%2Flocalhost%3A" + old_port, "http%3A%2F%2Flocalhost%3A" + new_port);
    boost::replace_all(url, "http%3A%2F%2F127.0.0.1%3A" + old_port, "http%3A%2F%2F127.0.0.1%3A" + new_port);

    return url;
}

}

int ZUserLogin::ensure_loopback_port()
{
    if (m_loopback_port <= 0) {
        m_loopback_port = reserve_loopback_port();
    }
    int port = m_loopback_port > 0 ? m_loopback_port : LOCALHOST_PORT;
    wxGetApp().start_http_server(port, m_cloud_agent->get_id());
    return port;
}

ZUserLogin::ZUserLogin(std::shared_ptr<ICloudServiceAgent> cloud_agent)
    : wxDialog((wxWindow*) (wxGetApp().mainframe), wxID_ANY, "Make3D Cloud Login"), m_cloud_agent(cloud_agent)
{
    SetBackgroundColour(*wxWHITE);

    wxFileName fn(from_u8(resources_dir()) + "/web/auth/index.html");
    TargetUrl = wxFileSystem::FileNameToURL(fn);

    BOOST_LOG_TRIVIAL(info) << "Make3D Cloud Login URL = " << TargetUrl.ToStdString();

    m_bbl_user_agent = wxString::Format("BBL-Slicer/v%s", wxGetApp().get_bbl_client_version());

    // Create the webview for Make3D Cloud Supabase Auth
    m_browser = WebView::CreateWebView(this, TargetUrl);
    if (m_browser == nullptr) {
        wxLogError("Could not init m_browser for ZUserLogin");
        return;
    }
    m_browser->Hide();
    m_browser->SetSize(0, 0);

    // Connect the webview events
    Bind(wxEVT_WEBVIEW_NAVIGATING, &ZUserLogin::OnNavigationRequest, this, m_browser->GetId());
    Bind(wxEVT_WEBVIEW_NAVIGATED, &ZUserLogin::OnNavigationComplete, this, m_browser->GetId());
    Bind(wxEVT_WEBVIEW_LOADED, &ZUserLogin::OnDocumentLoaded, this, m_browser->GetId());
    Bind(wxEVT_WEBVIEW_ERROR, &ZUserLogin::OnError, this, m_browser->GetId());
    Bind(wxEVT_WEBVIEW_NEWWINDOW, &ZUserLogin::OnNewWindow, this, m_browser->GetId());
    Bind(wxEVT_WEBVIEW_TITLE_CHANGED, &ZUserLogin::OnTitleChanged, this, m_browser->GetId());
    Bind(wxEVT_WEBVIEW_FULLSCREEN_CHANGED, &ZUserLogin::OnFullScreenChanged, this, m_browser->GetId());
    Bind(wxEVT_WEBVIEW_SCRIPT_MESSAGE_RECEIVED, &ZUserLogin::OnScriptMessage, this, m_browser->GetId());

    // UI
    SetTitle(_L("Make3D Cloud"));
    wxSize pSize = FromDIP(wxSize(480, 640));
    SetSize(pSize);

    CentreOnParent();
    wxGetApp().UpdateDlgDarkUI(this);
}

ZUserLogin::~ZUserLogin() {
    if (m_timer != NULL) {
        m_timer->Stop();
        delete m_timer;
        m_timer = NULL;
    }
}

void ZUserLogin::OnTimer(wxTimerEvent &event) {
    m_timer->Stop();

    if (m_networkOk == false)
    {
        ShowErrorPage();
    }
}

bool ZUserLogin::run() {
    m_timer = new wxTimer(this, NETWORK_OFFLINE_TIMER_ID);
    m_timer->Start(8000);

    if (this->ShowModal() == wxID_OK) {
        return true;
    } else {
        return false;
    }
}


void ZUserLogin::load_url(wxString &url)
{
    m_browser->LoadURL(url);
    m_browser->SetFocus();
    UpdateState();
}


/**
 * Method that retrieves the current state from the web control and updates
 * the GUI the reflect this current state.
 */
void ZUserLogin::UpdateState()
{
    // SetTitle(m_browser->GetCurrentTitle());
}

void ZUserLogin::OnIdle(wxIdleEvent &WXUNUSED(evt))
{
    if (m_browser->IsBusy()) {
        wxSetCursor(wxCURSOR_ARROWWAIT);
    } else {
        wxSetCursor(wxNullCursor);
    }
}

// void ZUserLogin::OnClose(wxCloseEvent& evt)
//{
//    this->Hide();
//}

/**
 * Callback invoked when there is a request to load a new page (for instance
 * when the user clicks a link)
 */
void ZUserLogin::OnNavigationRequest(wxWebViewEvent &evt)
{
    //wxLogMessage("%s", "Navigation request to '" + evt.GetURL() + "'(target='" + evt.GetTarget() + "')");

    UpdateState();
}

/**
 * Callback invoked when a navigation request was accepted
 */
void ZUserLogin::OnNavigationComplete(wxWebViewEvent &evt)
{
    // wxLogMessage("%s", "Navigation complete; url='" + evt.GetURL() + "'");
    m_browser->Show();
    Layout();
    UpdateState();
}

/**
 * Callback invoked when a page is finished loading
 */
void ZUserLogin::OnDocumentLoaded(wxWebViewEvent &evt)
{
    // Only notify if the document is the main frame, not a subframe
    wxString tmpUrl = evt.GetURL();
    std::string strHost = m_cloud_agent->get_cloud_service_host();

    if (tmpUrl.StartsWith("file://") || tmpUrl.Contains(strHost)) {
        m_networkOk = true;
        // wxLogMessage("%s", "Document loaded; url='" + evt.GetURL() + "'");
    }

    UpdateState();
}

/**
 * On new window, we veto to stop extra windows appearing
 */
void ZUserLogin::OnNewWindow(wxWebViewEvent &evt)
{
    wxString flag = " (other)";

    if (evt.GetNavigationAction() == wxWEBVIEW_NAV_ACTION_USER) { flag = " (user)"; }

    // wxLogMessage("%s", "New window; url='" + evt.GetURL() + "'" + flag);

    // If we handle new window events then just load them in this window as we
    // are a single window browser
    m_browser->LoadURL(evt.GetURL());

    UpdateState();
}

void ZUserLogin::OnTitleChanged(wxWebViewEvent &evt)
{
    // SetTitle(evt.GetString());
    // wxLogMessage("%s", "Title changed; title='" + evt.GetString() + "'");
}

void ZUserLogin::OnFullScreenChanged(wxWebViewEvent &evt)
{
    // wxLogMessage("Full screen changed; status = %d", evt.GetInt());
    ShowFullScreen(evt.GetInt() != 0);
}

void ZUserLogin::OnScriptMessage(wxWebViewEvent &evt)
{
    wxString str_input = evt.GetString();
    std::string raw = into_u8(str_input);
    BOOST_LOG_TRIVIAL(info) << "[Make3D Auth] ZUserLogin::OnScriptMessage raw: " << raw;

    try {
        raw.erase(0, raw.find_first_not_of(" \t\r\n"));
        raw.erase(raw.find_last_not_of(" \t\r\n") + 1);

        json j;
        try {
            j = json::parse(raw);
        } catch (const std::exception& e) {
            BOOST_LOG_TRIVIAL(error) << "[Make3D Auth] ZUserLogin::OnScriptMessage json::parse error: " << e.what();
            return;
        }

        // Unpack double-encoded JSON string
        if (j.is_string()) {
            try {
                j = json::parse(j.get<std::string>());
            } catch (...) {}
        }

        // Unpack wx wrapper object {"handler":"wx","raw":"..."}
        if (j.is_object() && j.contains("raw")) {
            if (j["raw"].is_string()) {
                try {
                    j = json::parse(j["raw"].get<std::string>());
                } catch (...) {}
            } else if (j["raw"].is_object()) {
                j = j["raw"];
            }
        }

        if (!j.is_object() || !j.contains("command")) {
            BOOST_LOG_TRIVIAL(warning) << "[Make3D Auth] ZUserLogin::OnScriptMessage payload missing command";
            return;
        }

        wxString strCmd = wxString::FromUTF8(j["command"].is_string() ? j["command"].get<std::string>().c_str() : "");
        BOOST_LOG_TRIVIAL(info) << "[Make3D Auth] ZUserLogin::OnScriptMessage parsed command: " << strCmd.ToStdString();
        
        if (m_cloud_agent && strCmd == "get_login_cmd") {
            // Return login config (backend_url, apikey, pkce)
            // WebView handles provider selection internally
            std::string login_cmd = m_cloud_agent->build_login_cmd();
            m_loopback_port       = 0;
            try {
                json cfg = json::parse(login_cmd);
                if (cfg.contains("pkce")) {
                    const auto& pkce = cfg["pkce"];
                    if (pkce.contains("loopback_port")) {
                        if (pkce["loopback_port"].is_number_integer()) {
                            m_loopback_port = pkce["loopback_port"].get<int>();
                        } else if (pkce["loopback_port"].is_string()) {
                            m_loopback_port = std::stoi(pkce["loopback_port"].get<std::string>());
                        }
                    }

                    if (m_loopback_port <= 0 && pkce.contains("redirect_uri") && pkce["redirect_uri"].is_string()) {
                        const std::string redirect_uri = pkce["redirect_uri"].get<std::string>();
                        const char*       prefixes[]   = {"localhost:", "127.0.0.1:"};
                        for (const char* prefix : prefixes) {
                            auto start = redirect_uri.find(prefix);
                            if (start == std::string::npos)
                                continue;
                            start += strlen(prefix);
                            auto        end      = redirect_uri.find('/', start);
                            std::string port_str = redirect_uri.substr(start, end - start);
                            try {
                                m_loopback_port = std::stoi(port_str);
                            } catch (...) {
                                m_loopback_port = 0;
                            }
                            break;
                        }
                    }
                }
            } catch (...) {
                m_loopback_port = 0;
            }
            wxString str_js = wxString::FromUTF8("window.postMessage(") + wxString::FromUTF8(login_cmd.c_str()) +
                              wxString::FromUTF8(", '*')");
            this->RunScript(str_js);
            return;
        }

        if (strCmd == "autotest_token")
        {
            m_AutotestToken = j["data"]["token"];
        }
        if (strCmd == "user_ticket_login") {
            auto* agent = wxGetApp().getAgent();
            if (!agent || !m_cloud_agent || !j.contains("data") || !j["data"].is_object() || !j["data"].contains("ticket")) {
                wxMessageBox(_L("Login failed. Please try again."), _L("Login"), wxICON_WARNING);
                return;
            }

            const auto  provider = m_cloud_agent->get_id();
            std::string ticket   = j["data"]["ticket"].get<std::string>();

            unsigned int token_http_code = 0;
            std::string  token_body;
            int          token_result = agent->get_my_token(ticket, &token_http_code, &token_body, provider);
            if (token_result != 0) {
                BOOST_LOG_TRIVIAL(warning) << "embedded_login: get_my_token failed, http_code=" << token_http_code;
                wxMessageBox(_L("Login failed. Please try again."), _L("Login"), wxICON_WARNING);
                return;
            }

            std::string access_token;
            std::string refresh_token;
            std::string expires_in_str;
            std::string refresh_expires_in_str;
            try {
                json token_j = json::parse(token_body);
                if (token_j.contains("accessToken"))
                    access_token = token_j["accessToken"].get<std::string>();
                if (token_j.contains("refreshToken"))
                    refresh_token = token_j["refreshToken"].get<std::string>();
                if (token_j.contains("expiresIn"))
                    expires_in_str = std::to_string(token_j["expiresIn"].get<double>());
                if (token_j.contains("refreshExpiresIn"))
                    refresh_expires_in_str = std::to_string(token_j["refreshExpiresIn"].get<double>());
            } catch (...) {
                wxMessageBox(_L("Login failed. Please try again."), _L("Login"), wxICON_WARNING);
                return;
            }

            if (access_token.empty()) {
                wxMessageBox(_L("Login failed. Please try again."), _L("Login"), wxICON_WARNING);
                return;
            }

            unsigned int profile_http_code = 0;
            std::string  profile_body;
            int          profile_result = agent->get_my_profile(access_token, &profile_http_code, &profile_body, provider);
            if (profile_result != 0) {
                BOOST_LOG_TRIVIAL(warning) << "embedded_login: get_my_profile failed, http_code=" << profile_http_code;
                wxMessageBox(_L("Login failed. Please try again."), _L("Login"), wxICON_WARNING);
                return;
            }

            std::string user_id;
            std::string user_name;
            std::string user_account;
            std::string user_avatar;
            try {
                json user_j = json::parse(profile_body);
                if (user_j.contains("uidStr"))
                    user_id = user_j["uidStr"].get<std::string>();
                if (user_j.contains("name"))
                    user_name = user_j["name"].get<std::string>();
                if (user_j.contains("avatar"))
                    user_avatar = user_j["avatar"].get<std::string>();
                if (user_j.contains("account"))
                    user_account = user_j["account"].get<std::string>();
            } catch (...) {
                BOOST_LOG_TRIVIAL(warning) << "embedded_login: profile JSON parse failed";
            }

            json login_j;
            login_j["command"]                   = "user_login";
            login_j["data"]["autotest_token"]    = m_AutotestToken;
            login_j["data"]["refresh_token"]     = refresh_token;
            login_j["data"]["token"]             = access_token;
            login_j["data"]["expires_in"]        = expires_in_str;
            login_j["data"]["refresh_expires_in"] = refresh_expires_in_str;
            login_j["data"]["user"]["uid"]       = user_id;
            login_j["data"]["user"]["name"]      = user_name;
            login_j["data"]["user"]["account"]   = user_account;
            login_j["data"]["user"]["avatar"]    = user_avatar;
            std::string message_json = login_j.dump();

            // Execute immediately so AppConfig is saved and homepage updated
            wxGetApp().handle_script_message(message_json, provider);
            EndModal(wxID_OK);
            wxTheApp->CallAfter([provider]() { wxGetApp().get_login_info(provider); });
        }
        else if (strCmd == "user_login") {
            if (j.contains("data") && j["data"].is_object()) {
                j["data"]["autotest_token"] = m_AutotestToken;
            }
            std::string message_json = j.dump();
            const auto provider = m_cloud_agent ? m_cloud_agent->get_id() : ORCA_CLOUD_PROVIDER;
            BOOST_LOG_TRIVIAL(info) << "[Make3D Auth] user_login: processing immediately for provider " << provider;

            // Execute immediately so AppConfig is saved and homepage updated
            wxGetApp().handle_script_message(message_json, provider);

            // Trigger homepage UI refresh immediately
            wxTheApp->CallAfter([provider]() {
                wxGetApp().get_login_info(provider);
            });

            // Only close modal if explicitly requested by payload (e.g. close_dialog: true)
            if (j.contains("close_dialog") && j["close_dialog"].is_boolean() && j["close_dialog"].get<bool>()) {
                EndModal(wxID_OK);
            }
        }
        else if (strCmd == "close_dialog" || strCmd == "continue_slicer" || strCmd == "dismiss") {
            EndModal(wxID_OK);
        }
        else if (strCmd == "get_localhost_url") {
            int loopback_port = ensure_loopback_port();
            std::string sequence_id = j["sequence_id"].get<std::string>();
            CallAfter([this, sequence_id] {
                json ack_j;
                ack_j["command"] = "get_localhost_url";
                int loopback_port = m_loopback_port > 0 ? m_loopback_port : LOCALHOST_PORT;
                ack_j["response"]["base_url"] = std::string(LOCALHOST_URL) + std::to_string(loopback_port);
                ack_j["response"]["result"] = "success";
                ack_j["sequence_id"] = sequence_id;
                wxString str_js = wxString::Format("window.postMessage(%s)", ack_j.dump());
                this->RunScript(str_js);
            });
        }
        else if (strCmd == "thirdparty_login") {
            if (j["data"].contains("url")) {
                std::string jump_url = j["data"]["url"].get<std::string>();
                int loopback_port = ensure_loopback_port();
                jump_url = rewrite_loopback_url(jump_url, loopback_port);
                CallAfter([this, jump_url] {
                    wxString url = wxString::FromUTF8(jump_url);
                    wxLaunchDefaultBrowser(url);
                    });
            }
        }
        else if (strCmd == "new_webpage") {
            if (j["data"].contains("url")) {
                std::string jump_url = j["data"]["url"].get<std::string>();
                CallAfter([this, jump_url] {
                    wxString url = wxString::FromUTF8(jump_url);
                    wxLaunchDefaultBrowser(url);
                    });
            }
            return;
        }
        // ── Make3D Cloud Preset Sync: Upload ──────────────────────────────
        else if (strCmd == "get_user_presets_json") {
            // Read local user preset files for the active user and return as JSON
            std::string sequence_id;
            std::string user_folder;
            if (j.contains("sequence_id")) sequence_id = j["sequence_id"].get<std::string>();
            if (j.contains("user_id"))     user_folder = j["user_id"].get<std::string>();
            if (user_folder.empty() && wxGetApp().app_config) {
                user_folder = wxGetApp().app_config->get("preset_folder");
            }
            if (user_folder.empty()) user_folder = "default";
            for (auto& c : user_folder) {
                if (c == '/' || c == '\\' || c == ':' || c == '*' || c == '?' || c == '"' || c == '<' || c == '>' || c == '|' || c == '@' || c == '.')
                    c = '_';
            }

            CallAfter([this, sequence_id, user_folder] {
                try {
                    namespace fs = boost::filesystem;
                    std::string data_dir_str = Slic3r::data_dir();
                    json presets_array = json::array();
                    const std::vector<std::string> preset_types = {"process", "filament", "machine"};

                    // Only scan the user's own isolated folder (NO fallback to default)
                    // This prevents guest/default presets from mixing with user presets
                    fs::path presets_root = fs::path(data_dir_str) / "user" / user_folder;
                    if (fs::exists(presets_root)) {
                        for (const auto& pt_name : preset_types) {
                            fs::path type_dir = presets_root / pt_name;
                            if (!fs::exists(type_dir)) continue;
                            for (fs::directory_iterator it(type_dir); it != fs::directory_iterator(); ++it) {
                                if (it->path().extension() != ".json") continue;
                                std::string stem_name = it->path().stem().string();
                                try {
                                    std::ifstream ifs(it->path().string());
                                    if (!ifs.is_open()) continue;
                                    std::string content((std::istreambuf_iterator<char>(ifs)),
                                                         std::istreambuf_iterator<char>());
                                    json preset_j = json::parse(content);
                                    json entry;
                                    entry["preset_type"] = pt_name;
                                    entry["preset_name"] = stem_name;
                                    entry["preset_data"] = preset_j;
                                    presets_array.push_back(entry);
                                } catch (...) {}
                            }
                        }
                    }

                    json resp;
                    resp["command"]     = "presets_data";
                    resp["sequence_id"] = sequence_id;
                    resp["presets"]     = presets_array;
                    wxString js = wxString::Format("window.postMessage(%s)", resp.dump());
                    RunScript(js);
                    BOOST_LOG_TRIVIAL(info) << "[Make3D Sync] Exported " << presets_array.size() << " presets for user " << user_folder;
                } catch (std::exception& e) {
                    BOOST_LOG_TRIVIAL(error) << "[Make3D Sync] get_user_presets_json failed: " << e.what();
                }
            });
        }
        // ── Make3D Cloud Preset Sync: Download ────────────────────────────
        else if (strCmd == "import_cloud_presets") {
            if (!j.contains("presets")) return;
            json presets_to_import = j["presets"];
            std::string user_folder;
            if (j.contains("user_id")) user_folder = j["user_id"].get<std::string>();
            if (user_folder.empty() && wxGetApp().app_config) {
                user_folder = wxGetApp().app_config->get("preset_folder");
            }
            if (user_folder.empty()) user_folder = "default";
            for (auto& c : user_folder) {
                if (c == '/' || c == '\\' || c == ':' || c == '*' || c == '?' || c == '"' || c == '<' || c == '>' || c == '|' || c == '@' || c == '.')
                    c = '_';
            }

            CallAfter([this, presets_to_import, user_folder] {
                try {
                    namespace fs = boost::filesystem;
                    std::string data_dir_str = Slic3r::data_dir();
                    // SAVE TO ISOLATED USER FOLDER
                    fs::path presets_root = fs::path(data_dir_str) / "user" / user_folder;
                    int imported = 0;

                    for (const auto& entry : presets_to_import) {
                        if (!entry.contains("preset_type") || !entry.contains("preset_name") || !entry.contains("preset_data"))
                            continue;
                        std::string pt_name   = entry["preset_type"].get<std::string>();
                        std::string pt_fname  = entry["preset_name"].get<std::string>();
                        json        pt_data   = entry["preset_data"];
                        // Sanitize filename
                        for (auto& c : pt_fname) {
                            if (c == '/' || c == '\\' || c == ':' || c == '*' || c == '?' || c == '"' || c == '<' || c == '>' || c == '|')
                                c = '_';
                        }
                        fs::path type_dir = presets_root / pt_name;
                        fs::create_directories(type_dir);
                        fs::path out_path = type_dir / (pt_fname + ".json");
                        std::ofstream ofs(out_path.string());
                        if (ofs.is_open()) {
                            ofs << pt_data.dump(2);
                            imported++;
                        }
                    }

                    // Reload user presets into active slicer UI immediately
                    if (wxGetApp().app_config) {
                        wxGetApp().app_config->set("preset_folder", user_folder);
                    }
                    if (wxGetApp().preset_bundle) {
                        wxGetApp().preset_bundle->update_user_presets_directory(user_folder);
                        wxGetApp().preset_bundle->load_user_presets(user_folder, ForwardCompatibilitySubstitutionRule::Enable);
                    }
                    if (wxGetApp().mainframe) {
                        wxGetApp().mainframe->update_side_preset_ui();
                    }

                    BOOST_LOG_TRIVIAL(info) << "[Make3D Sync] Imported " << imported << " presets for user " << user_folder;
                    // Notify JS of completion
                    json resp;
                    resp["command"] = "import_presets_done";
                    resp["count"]   = imported;
                    wxString js = wxString::Format("window.postMessage(%s)", resp.dump());
                    RunScript(js);
                } catch (std::exception& e) {
                    BOOST_LOG_TRIVIAL(error) << "[Make3D Sync] import_cloud_presets failed: " << e.what();
                }
            });
        }
    } catch (std::exception &e) {
        wxMessageBox(e.what(), _L("parse json failed"), wxICON_WARNING);
        Close();
    }
}

void ZUserLogin::RunScript(const wxString &javascript)
{
    // Remember the script we run in any case, so the next time the user opens
    // the "Run Script" dialog box, it is shown there for convenient updating.
    m_javascript = javascript;

    if (!m_browser) return;

    WebView::RunScript(m_browser, javascript);
}
#if wxUSE_WEBVIEW_IE
void ZUserLogin::OnRunScriptObjectWithEmulationLevel(wxCommandEvent &WXUNUSED(evt))
{
    wxWebViewIE::MSWSetModernEmulationLevel();
    RunScript("function f(){var person = new Object();person.name = 'Foo'; \
    person.lastName = 'Bar';return person;}f();");
    wxWebViewIE::MSWSetModernEmulationLevel(false);
}

void ZUserLogin::OnRunScriptDateWithEmulationLevel(wxCommandEvent &WXUNUSED(evt))
{
    wxWebViewIE::MSWSetModernEmulationLevel();
    RunScript("function f(){var d = new Date('10/08/2017 21:30:40'); \
    var tzoffset = d.getTimezoneOffset() * 60000; return \
    new Date(d.getTime() - tzoffset);}f();");
    wxWebViewIE::MSWSetModernEmulationLevel(false);
}

void ZUserLogin::OnRunScriptArrayWithEmulationLevel(wxCommandEvent &WXUNUSED(evt))
{
    wxWebViewIE::MSWSetModernEmulationLevel();
    RunScript("function f(){ return [\"foo\", \"bar\"]; }f();");
    wxWebViewIE::MSWSetModernEmulationLevel(false);
}
#endif

/**
 * Callback invoked when a loading error occurs
 */
void ZUserLogin::OnError(wxWebViewEvent &evt)
{
#define WX_ERROR_CASE(type) \
    case type: category = #type; break;

    wxString category;
    switch (evt.GetInt()) {
        WX_ERROR_CASE(wxWEBVIEW_NAV_ERR_CONNECTION);
        WX_ERROR_CASE(wxWEBVIEW_NAV_ERR_CERTIFICATE);
        WX_ERROR_CASE(wxWEBVIEW_NAV_ERR_AUTH);
        WX_ERROR_CASE(wxWEBVIEW_NAV_ERR_SECURITY);
        WX_ERROR_CASE(wxWEBVIEW_NAV_ERR_NOT_FOUND);
        WX_ERROR_CASE(wxWEBVIEW_NAV_ERR_REQUEST);
        WX_ERROR_CASE(wxWEBVIEW_NAV_ERR_USER_CANCELLED);
        WX_ERROR_CASE(wxWEBVIEW_NAV_ERR_OTHER);
    }

    if( evt.GetInt()==wxWEBVIEW_NAV_ERR_CONNECTION )
    {
        if(m_timer!=NULL)
            m_timer->Stop();

        if (m_networkOk==false)
            ShowErrorPage();
    }

    // wxLogMessage("%s", "Error; url='" + evt.GetURL() + "', error='" +
    // category + " (" + evt.GetString() + ")'");

    // Show the info bar with an error
    // m_info->ShowMessage(_L("An error occurred loading ") + evt.GetURL() +
    // "\n" + "'" + category + "'", wxICON_ERROR);

    UpdateState();
}

void ZUserLogin::OnScriptResponseMessage(wxCommandEvent &WXUNUSED(evt))
{
    // if (!m_response_js.empty())
    //{
    //    RunScript(m_response_js);
    //}

    // RunScript("This is a message to Web!");
    // RunScript("postMessage(\"AABBCCDD\");");
}

bool  ZUserLogin::ShowErrorPage()
{
    wxString ErrortUrl = from_u8((boost::filesystem::path(resources_dir()) / "web\\login\\error.html").make_preferred().string());
    load_url(ErrortUrl);

    return true;
}


}} // namespace Slic3r::GUI
