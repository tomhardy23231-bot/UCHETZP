import sys
from sqlalchemy import create_engine, text

def update_database():
    """
    Script to update database structure for the payroll system.
    """
    # Hardcoded database URL for Neon PostgreSQL
    database_url = "postgresql://neondb_owner:npg_k9Du1VPWecfH@ep-bold-feather-aiarcol1.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require"

    print(f"Connecting to database...")
    
    try:
        engine = create_engine(database_url)
        
        # Raw SQL queries to run
        queries = [
            # 1. Create scan_logs table
            """
            CREATE TABLE IF NOT EXISTS scan_logs (
                id SERIAL PRIMARY KEY,
                rfid VARCHAR(255) NOT NULL,
                timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            """
        ]

        with engine.begin() as connection:
            for query in queries:
                print(f"Executing: {query.strip().splitlines()[0]}...")
                connection.execute(text(query))
        
        print("\nSuccess: Database structure updated successfully!")

    except Exception as e:
        print(f"\nAn error occurred during update: {e}")
        sys.exit(1)

if __name__ == "__main__":
    update_database()
