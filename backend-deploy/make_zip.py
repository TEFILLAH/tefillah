import zipfile, os
with zipfile.ZipFile('../tefillah-api.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk('.'):
        # skip this script itself
        for f in files:
            if f == 'make_zip.py':
                continue
            fp = os.path.join(root, f)
            arcname = os.path.relpath(fp, '.').replace(os.sep, '/')
            z.write(fp, arcname)
            print('added:', arcname)
print('done')
