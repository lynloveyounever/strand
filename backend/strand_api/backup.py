"""Usage: python -m strand_api.backup path/to/strand.sqlite3 path/to/new-backup.sqlite3"""
import argparse
from .storage import Database

def main():
    parser = argparse.ArgumentParser(description='Create a consistent SQLite backup (never overwrite)')
    parser.add_argument('database')
    parser.add_argument('destination')
    args = parser.parse_args()
    from pathlib import Path
    if not Path(args.database).is_file():
        parser.error('Database does not exist')
    Database(args.database).backup(args.destination)
    print('Backup integrity check: ok')

if __name__ == '__main__':
    main()
