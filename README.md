## Local PostgreSQL Setup

1. Install PostgreSQL and start the service:
   brew install postgresql
   brew services start postgresql

2. Create a database:
   CREATE DATABASE smart_scheduler;

3. Create a `.env` file in the project root:

   DATABASE_URL=postgresql://YOUR_USERNAME@localhost:5432/smart_scheduler
   SECRET_KEY=your-secret-key

4. Install dependencies:
   python3 -m pip install django dj-database-url "psycopg[binary]" python-dotenv

5. Run migrations:
   python3 manage.py migrate
   https://github.com/EusocialDev/smart-scheduler/pull/new/feature/postgres-database-url-setup