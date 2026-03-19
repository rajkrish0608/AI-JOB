-- ============================================================================
-- AI Job Apply — Seed Data
-- Migration: 002_seed_data.sql
-- Description: Sample data for development and testing
-- ============================================================================

-- NOTE: This migration only runs in development/test environments.
-- It creates sample job listings for testing the platform.

-- Sample job listings (no user-specific data — users are created via auth)
INSERT INTO public.job_listings (title, company, location, work_style, job_type, experience_level, salary_min, salary_max, salary_currency, description, requirements, keywords, platform, platform_job_id, apply_url, is_easy_apply, posted_date)
VALUES
    (
        'Software Engineer - Full Stack',
        'Infosys',
        'Bangalore, India',
        'hybrid',
        'full_time',
        'entry',
        600000,
        1200000,
        'INR',
        'We are looking for a Full Stack Software Engineer to join our digital team. You will build scalable web applications using modern technologies. Freshers with strong fundamentals are welcome to apply.',
        'Bachelor''s degree in CS or related field. Knowledge of React, Node.js, and SQL. Good communication skills.',
        ARRAY['react', 'node.js', 'sql', 'javascript', 'fullstack', 'fresher-friendly'],
        'linkedin',
        'LI-INF-001',
        'https://www.linkedin.com/jobs/view/example-1',
        TRUE,
        NOW() - INTERVAL '2 days'
    ),
    (
        'Python Developer - AI/ML',
        'TCS',
        'Hyderabad, India',
        'onsite',
        'full_time',
        'mid',
        1000000,
        1800000,
        'INR',
        'Join our AI Center of Excellence to work on cutting-edge ML projects. You will build and deploy machine learning models using Python, TensorFlow, and cloud platforms.',
        '2+ years of experience with Python. Familiarity with TensorFlow or PyTorch. AWS or GCP experience preferred.',
        ARRAY['python', 'tensorflow', 'pytorch', 'machine-learning', 'aws', 'gcp'],
        'naukri',
        'NK-TCS-002',
        'https://www.naukri.com/job-listings/example-2',
        FALSE,
        NOW() - INTERVAL '5 days'
    ),
    (
        'Frontend Developer Intern',
        'Razorpay',
        'Remote, India',
        'remote',
        'internship',
        'internship',
        25000,
        40000,
        'INR',
        'We are hiring Frontend Developer Interns to work on our payment dashboard. This is a great opportunity for students and freshers to gain hands-on experience with React, TypeScript, and modern web tools.',
        'Currently pursuing or recently completed B.Tech/B.E. Knowledge of HTML, CSS, JavaScript. React experience is a plus.',
        ARRAY['react', 'typescript', 'html', 'css', 'javascript', 'internship', 'fresher'],
        'internshala',
        'IS-RZP-003',
        'https://internshala.com/internship/detail/example-3',
        TRUE,
        NOW() - INTERVAL '1 day'
    ),
    (
        'Backend Engineer',
        'Flipkart',
        'Bangalore, India',
        'hybrid',
        'full_time',
        'mid',
        1500000,
        2500000,
        'INR',
        'We are looking for Backend Engineers to build high-performance services powering millions of transactions. Work with Java, Spring Boot, microservices, and distributed systems.',
        '2-4 years of experience. Strong knowledge of Java, Spring Boot, and SQL/NoSQL databases. Experience with Kafka or RabbitMQ preferred.',
        ARRAY['java', 'spring-boot', 'microservices', 'kafka', 'sql', 'nosql', 'distributed-systems'],
        'linkedin',
        'LI-FLK-004',
        'https://www.linkedin.com/jobs/view/example-4',
        TRUE,
        NOW() - INTERVAL '3 days'
    ),
    (
        'Data Analyst',
        'Zomato',
        'Gurugram, India',
        'onsite',
        'full_time',
        'entry',
        500000,
        900000,
        'INR',
        'We need a Data Analyst to help us make data-driven decisions. You will analyze user behavior, create dashboards, and work closely with product and business teams.',
        'Bachelor''s degree. Proficiency in SQL, Excel, and Tableau/Power BI. Python or R knowledge is a plus. Freshers welcome.',
        ARRAY['sql', 'excel', 'tableau', 'power-bi', 'python', 'data-analysis', 'fresher-friendly'],
        'indeed',
        'IN-ZMT-005',
        'https://in.indeed.com/viewjob?jk=example-5',
        FALSE,
        NOW() - INTERVAL '4 days'
    );
