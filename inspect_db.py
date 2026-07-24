import sqlite3
import os
path = os.path.join(os.getcwd(), 'neurosync.db')
print('DB', path)
conn = sqlite3.connect(path)
cur = conn.cursor()
cur.execute("SELECT name, type, sql FROM sqlite_master WHERE name='users'")
print('users table DDL:', cur.fetchone())
cur.execute("PRAGMA table_info(users)")
print('columns:')
for row in cur.fetchall():
    print(row)
conn.close()
