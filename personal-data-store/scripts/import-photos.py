#!/usr/bin/env python3
import json, sys, os
import subprocess

DB_URL = "postgres://pds:pds_local@localhost:5432/personal_data_store"

def run_sql(sql, params=None):
    """Run SQL via psql in docker"""
    cmd = ["docker", "exec", "-i", "personal-data-store-postgres-1", "psql", "-U", "pds", "-d", "personal_data_store", "-c", sql]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result

def import_photo(p):
    place = p.get("place") or {}
    address = place.get("address") or {}
    date_str = p.get("date")
    date = date_str if date_str and date_str > "2000" else None

    filename = (p.get("filename") or "").replace("'", "''")
    orig = (p.get("original_filename") or "").replace("'", "''")
    place_name = (place.get("name") or "").replace("'", "''")
    city = (address.get("city") or "").replace("'", "''")
    country = (address.get("country") or "").replace("'", "''")

    lat = p.get("latitude") or "NULL"
    lon = p.get("longitude") or "NULL"
    is_photo = "true" if p.get("isphoto") else "false"
    is_video = "true" if p.get("ismovie") else "false"

    persons = json.dumps(p.get("persons") or []).replace("'", "''")
    labels = json.dumps(p.get("labels") or []).replace("'", "''")
    albums = json.dumps(p.get("albums") or []).replace("'", "''")

    ai_caption = (p.get("ai_caption") or "").replace("'", "''")
    uti = (p.get("uti") or "").replace("'", "''")

    date_sql = f"'{date}'" if date else "NULL"
    lat_sql = str(lat) if lat != "NULL" else "NULL"
    lon_sql = str(lon) if lon != "NULL" else "NULL"

    persons_sql = f"'{persons}'::jsonb" if p.get("persons") else "NULL"
    labels_sql = f"'{labels}'::jsonb" if p.get("labels") else "NULL"
    albums_sql = f"'{albums}'::jsonb" if p.get("albums") else "NULL"

    meta = json.dumps({"uti": p.get("uti"), "aiCaption": p.get("ai_caption") or None}).replace("'", "''")

    return f"""('{filename}', '{orig}', {date_sql}, {lat_sql}, {lon_sql}, '{place_name}', '{city}', '{country}', {is_photo}, {is_video}, {persons_sql}, {labels_sql}, {albums_sql}, '{meta}'::jsonb)"""

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 import-photos.py <file.json>")
        sys.exit(1)

    with open(sys.argv[1]) as f:
        data = json.load(f)

    print(f"Processing {len(data)} photos...")
    imported = 0
    skipped = 0
    batch_size = 50

    for i in range(0, len(data), batch_size):
        batch = data[i:i+batch_size]
        values = []
        for p in batch:
            try:
                values.append(import_photo(p))
            except Exception as e:
                skipped += 1
                continue

        if not values:
            continue

        sql = f"""INSERT INTO photos (filename, original_filename, date, latitude, longitude, place_name, city, country, is_photo, is_video, persons, labels, albums, metadata)
VALUES {','.join(values)}
ON CONFLICT (filename) DO NOTHING;"""

        result = subprocess.run(
            ["docker", "exec", "-i", "personal-data-store-postgres-1", "psql", "-U", "pds", "-d", "personal_data_store"],
            input=sql, capture_output=True, text=True
        )

        if "INSERT" in result.stdout:
            count = int(result.stdout.strip().split(" ")[-1])
            imported += count
            skipped += len(batch) - count
        elif result.stderr:
            # Fall back to one-by-one
            for p in batch:
                try:
                    v = import_photo(p)
                    single_sql = f"""INSERT INTO photos (filename, original_filename, date, latitude, longitude, place_name, city, country, is_photo, is_video, persons, labels, albums, metadata) VALUES {v} ON CONFLICT (filename) DO NOTHING;"""
                    r = subprocess.run(
                        ["docker", "exec", "-i", "personal-data-store-postgres-1", "psql", "-U", "pds", "-d", "personal_data_store"],
                        input=single_sql, capture_output=True, text=True
                    )
                    if "INSERT 0 1" in r.stdout:
                        imported += 1
                    else:
                        skipped += 1
                except:
                    skipped += 1

        if (i + batch_size) % 1000 == 0:
            print(f"  {min(i+batch_size, len(data))}/{len(data)} ({imported} imported)")

    print(f"Done: {imported} imported, {skipped} skipped")

if __name__ == "__main__":
    main()
