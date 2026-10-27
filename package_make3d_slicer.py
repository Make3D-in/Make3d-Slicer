import os
import zipfile
import shutil

# Make3D Slicer Distribution Packager
SRC_DIR = "D:/Orca_modify/build/OrcaSlicer"
OUTPUT_DIR = "C:/Users/almighty/Desktop"
VERSION = "v1.0.2"

dist_zip = os.path.join(OUTPUT_DIR, f"Make3D_Slicer_{VERSION}_Windows_x64.zip")
exclude_dirs = {"include", "lib"}
exclude_files = {"orca-slicer.exe"}

print(f"==========================================")
print(f" Packaging Make3D Slicer {VERSION} ")
print(f" Source: {SRC_DIR}")
print(f" Target: {dist_zip}")
print(f"==========================================")

with zipfile.ZipFile(dist_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for root, dirs, files in os.walk(SRC_DIR):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for file in files:
            if file in exclude_files:
                continue
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, SRC_DIR)
            arc_name = os.path.join("Make3D_Slicer", rel_path)
            zf.write(full_path, arc_name)

zip_size_mb = os.path.getsize(dist_zip) / (1024 * 1024)
print(f"\nSUCCESS: Customer package created!")
print(f"File: {dist_zip} ({zip_size_mb:.2f} MB)")
