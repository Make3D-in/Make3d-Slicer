; Script generated for Make3D Slicer Windows Setup Installer
; Inno Setup 6 Script

#define MyAppName "Make3D Slicer"
#define MyAppVersion "1.0.2"
#define MyAppPublisher "Make3D"
#define MyAppURL "https://make3d.in"
#define MyAppExeName "Make3D Slicer.exe"
#define SourceDir "D:\Orca_modify\build\OrcaSlicer"

[Setup]
AppId={{D3E64F8A-7B32-4E9B-9C12-8F72A5E4C12D}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL=https://github.com/Make3D-in/Make3d-Slicer/releases
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile={#SourceDir}\LICENSE.txt
OutputDir=D:\Orca_modify\installer\output
OutputBaseFilename=Make3D_Slicer_Setup_v1.0.2_Windows_x64
SetupIconFile=D:\Orca_modify\resources\images\OrcaSlicer.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ChangesAssociations=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "associate_stl"; Description: "Associate with 3D STL files (.stl)"; GroupDescription: "File Associations:"
Name: "associate_3mf"; Description: "Associate with 3MF Project files (.3mf)"; GroupDescription: "File Associations:"
Name: "associate_step"; Description: "Associate with STEP CAD files (.step, .stp)"; GroupDescription: "File Associations:"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "include\*,lib\*,orca-slicer.exe"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"; WorkingDir: "{app}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
; .stl association
Root: HKA; Subkey: "Software\Classes\.stl\OpenWithProgids"; ValueType: string; ValueName: "Make3DSlicer.AssocFile.STL"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associate_stl
Root: HKA; Subkey: "Software\Classes\Make3DSlicer.AssocFile.STL"; ValueType: string; ValueName: ""; ValueData: "Make3D STL 3D Model"; Flags: uninsdeletekey; Tasks: associate_stl
Root: HKA; Subkey: "Software\Classes\Make3DSlicer.AssocFile.STL\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#MyAppExeName},0"; Tasks: associate_stl
Root: HKA; Subkey: "Software\Classes\Make3DSlicer.AssocFile.STL\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Tasks: associate_stl

; .3mf association
Root: HKA; Subkey: "Software\Classes\.3mf\OpenWithProgids"; ValueType: string; ValueName: "Make3DSlicer.AssocFile.3MF"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associate_3mf
Root: HKA; Subkey: "Software\Classes\Make3DSlicer.AssocFile.3MF"; ValueType: string; ValueName: ""; ValueData: "Make3D 3MF Slicer Project"; Flags: uninsdeletekey; Tasks: associate_3mf
Root: HKA; Subkey: "Software\Classes\Make3DSlicer.AssocFile.3MF\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#MyAppExeName},0"; Tasks: associate_3mf
Root: HKA; Subkey: "Software\Classes\Make3DSlicer.AssocFile.3MF\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Tasks: associate_3mf

; .step / .stp association
Root: HKA; Subkey: "Software\Classes\.step\OpenWithProgids"; ValueType: string; ValueName: "Make3DSlicer.AssocFile.STEP"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associate_step
Root: HKA; Subkey: "Software\Classes\.stp\OpenWithProgids"; ValueType: string; ValueName: "Make3DSlicer.AssocFile.STEP"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associate_step
Root: HKA; Subkey: "Software\Classes\Make3DSlicer.AssocFile.STEP"; ValueType: string; ValueName: ""; ValueData: "Make3D STEP CAD Model"; Flags: uninsdeletekey; Tasks: associate_step
Root: HKA; Subkey: "Software\Classes\Make3DSlicer.AssocFile.STEP\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#MyAppExeName},0"; Tasks: associate_step
Root: HKA; Subkey: "Software\Classes\Make3DSlicer.AssocFile.STEP\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Tasks: associate_step

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent
