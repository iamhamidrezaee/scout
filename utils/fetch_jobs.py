import json
import signal
import sys
import time
import random
from datetime import datetime
from multiprocessing import Pool, Manager, cpu_count
from concurrent.futures import ProcessPoolExecutor, as_completed
import os

# Global flag for graceful shutdown
shutdown_flag = False

def signal_handler(signum, frame):
    global shutdown_flag
    print(f"\n🛑 Received interrupt signal. Finishing current batch and shutting down gracefully...")
    shutdown_flag = True

# Set up signal handler for Ctrl+C
signal.signal(signal.SIGINT, signal_handler)

class ContinuousJobScraper:
    def __init__(self):
        self.all_jobs = []
        self.processed_count = 0
        self.batch_size = cpu_count() * 2  # Optimize for CPU cores
        
        # MASSIVE diversity in job searches - covering ALL fields for student platform
        self.job_searches = [
            # Technology & Engineering
            "software engineer", "data scientist", "web developer", "mobile developer", "devops engineer",
            "cybersecurity analyst", "cloud engineer", "machine learning engineer", "ai engineer", "blockchain developer",
            "full stack developer", "frontend developer", "backend developer", "ui ux designer", "product manager",
            "technical writer", "qa engineer", "systems administrator", "network engineer", "database administrator",
            "game developer", "embedded systems engineer", "robotics engineer", "hardware engineer", "firmware engineer",
            
            # Business & Finance
            "business analyst", "financial analyst", "investment banker", "accountant", "controller", "auditor",
            "management consultant", "project manager", "operations manager", "supply chain manager", "logistics coordinator",
            "business development", "sales representative", "account manager", "customer success manager", "marketing manager",
            "digital marketing specialist", "social media manager", "content marketing", "seo specialist", "ppc specialist",
            "brand manager", "market research analyst", "pricing analyst", "revenue analyst", "budget analyst",
            
            # Healthcare & Life Sciences
            "registered nurse", "physician assistant", "medical assistant", "pharmacy technician", "medical technologist",
            "physical therapist", "occupational therapist", "respiratory therapist", "radiologic technologist", "lab technician",
            "clinical research coordinator", "biomedical engineer", "biotechnology", "pharmaceutical", "medical device",
            "health informatics", "public health", "epidemiologist", "biostatistician", "clinical data manager",
            
            # Education & Training
            "teacher", "professor", "tutor", "instructional designer", "curriculum developer", "education consultant",
            "school counselor", "academic advisor", "learning specialist", "educational technology", "training coordinator",
            "corporate trainer", "e-learning developer", "educational researcher", "librarian", "museum educator",
            
            # Creative & Design
            "graphic designer", "art director", "creative director", "video editor", "photographer", "animator",
            "illustrator", "interior designer", "fashion designer", "industrial designer", "architect", "landscape architect",
            "copywriter", "content creator", "journalist", "editor", "technical illustrator", "game artist",
            "motion graphics designer", "packaging designer", "brand designer", "web designer",
            
            # Sales & Customer Service
            "sales associate", "sales manager", "inside sales", "outside sales", "account executive", "business development representative",
            "customer service representative", "customer support", "call center representative", "client relations", "customer experience",
            "retail sales", "store manager", "merchandiser", "buyer", "purchasing agent", "vendor relations",
            
            # Operations & Manufacturing
            "operations coordinator", "production manager", "quality control", "manufacturing engineer", "process improvement",
            "lean manufacturing", "six sigma", "warehouse supervisor", "inventory manager", "distribution coordinator",
            "shipping receiving", "maintenance technician", "equipment operator", "assembly line worker", "machine operator",
            
            # Human Resources & Administration
            "human resources", "hr generalist", "recruiter", "talent acquisition", "compensation analyst", "benefits administrator",
            "payroll specialist", "training specialist", "organizational development", "employee relations", "hr coordinator",
            "administrative assistant", "executive assistant", "office manager", "receptionist", "data entry clerk",
            
            # Legal & Compliance
            "lawyer", "attorney", "paralegal", "legal assistant", "compliance officer", "contract manager",
            "risk management", "regulatory affairs", "legal counsel", "corporate lawyer", "litigation attorney",
            "patent attorney", "immigration lawyer", "tax attorney", "public defender", "legal researcher",
            
            # Media & Communications
            "public relations", "communications specialist", "marketing communications", "social media coordinator", 
            "content writer", "blogger", "podcaster", "radio host", "tv producer", "film editor", "sound engineer",
            "broadcast technician", "media planner", "advertising coordinator", "event coordinator", "conference manager",
            
            # Science & Research
            "research scientist", "lab researcher", "research assistant", "data analyst", "statistician", "chemist",
            "biologist", "physicist", "environmental scientist", "geologist", "meteorologist", "marine biologist",
            "food scientist", "materials scientist", "research coordinator", "clinical researcher", "market researcher",
            
            # Hospitality & Tourism
            "hotel manager", "front desk agent", "concierge", "event planner", "travel agent", "tour guide",
            "restaurant manager", "chef", "cook", "server", "bartender", "sommelier", "catering coordinator",
            "housekeeping supervisor", "guest services", "cruise staff", "airline crew", "flight attendant",
            
            # Transportation & Logistics
            "truck driver", "delivery driver", "logistics coordinator", "transportation manager", "fleet manager",
            "dispatch coordinator", "warehouse worker", "forklift operator", "shipping clerk", "customs broker",
            "supply chain analyst", "procurement specialist", "vendor manager", "import export coordinator",
            
            # Real Estate & Construction
            "real estate agent", "property manager", "leasing consultant", "real estate appraiser", "mortgage broker",
            "construction manager", "project superintendent", "estimator", "architect", "civil engineer", "electrician",
            "plumber", "carpenter", "hvac technician", "construction worker", "building inspector", "surveyor",
            
            # Non-Profit & Social Services
            "social worker", "case manager", "program coordinator", "community outreach", "fundraising coordinator",
            "grant writer", "volunteer coordinator", "nonprofit manager", "development officer", "program manager",
            "mental health counselor", "substance abuse counselor", "family therapist", "youth coordinator",
            
            # Government & Public Service
            "government analyst", "policy analyst", "city planner", "public administrator", "legislative assistant",
            "intelligence analyst", "foreign service", "diplomatic", "military", "police officer", "firefighter",
            "emergency management", "homeland security", "border patrol", "customs officer", "park ranger",
            
            # Sports & Fitness
            "personal trainer", "fitness instructor", "sports coach", "athletic trainer", "physical therapist",
            "nutritionist", "sports marketing", "sports management", "recreation coordinator", "gym manager",
            "yoga instructor", "pilates instructor", "sports analyst", "sports journalist", "referee",
            
            # Agriculture & Environment
            "agricultural scientist", "farm manager", "environmental engineer", "sustainability coordinator", "conservation",
            "forestry", "wildlife biologist", "environmental consultant", "renewable energy", "solar installer",
            "wind technician", "environmental compliance", "waste management", "recycling coordinator",
            
            # Entry Level & Internships
            "entry level", "recent graduate", "intern", "trainee", "apprentice", "junior", "associate",
            "coordinator", "assistant", "clerk", "representative", "specialist", "analyst entry level",
            
            # Remote & Flexible
            "remote work", "work from home", "freelance", "part time", "contract", "temporary", "seasonal",
            "flexible schedule", "virtual assistant", "online tutor", "remote customer service"
        ]
        
        # US locations for geographic diversity
        self.us_locations = [
            "San Francisco, CA", "New York, NY", "Los Angeles, CA", "Chicago, IL", "Houston, TX",
            "Phoenix, AZ", "Philadelphia, PA", "San Antonio, TX", "San Diego, CA", "Dallas, TX",
            "San Jose, CA", "Austin, TX", "Jacksonville, FL", "Fort Worth, TX", "Columbus, OH",
            "Charlotte, NC", "San Francisco, CA", "Indianapolis, IN", "Seattle, WA", "Denver, CO",
            "Washington, DC", "Boston, MA", "El Paso, TX", "Nashville, TN", "Detroit, MI",
            "Oklahoma City, OK", "Portland, OR", "Las Vegas, NV", "Memphis, TN", "Louisville, KY",
            "Baltimore, MD", "Milwaukee, WI", "Albuquerque, NM", "Tucson, AZ", "Fresno, CA",
            "Sacramento, CA", "Mesa, AZ", "Kansas City, MO", "Atlanta, GA", "Long Beach, CA",
            "Colorado Springs, CO", "Raleigh, NC", "Miami, FL", "Virginia Beach, VA", "Omaha, NE",
            "Oakland, CA", "Minneapolis, MN", "Tulsa, OK", "Arlington, TX", "Tampa, FL"
        ]
    
    def scrape_job_batch(self, search_params):
        """Scrape a single batch of jobs"""
        try:
            from jobspy import scrape_jobs
            
            # Add random delay to avoid overwhelming Indeed
            time.sleep(random.uniform(0.5, 2.0))
            
            jobs_df = scrape_jobs(
                site_name=['indeed'],
                search_term=search_params['search_term'],
                location=search_params['location'],
                country_indeed='USA',
                results_wanted=search_params.get('results_wanted', 25),
                hours_old=72,  # Last 3 days for freshness
                job_type='fulltime'
            )
            
            if jobs_df.empty:
                return []
            
            normalized_jobs = []
            for _, row in jobs_df.iterrows():
                normalized_job = self.normalize_indeed_job(row)
                if normalized_job:
                    normalized_jobs.append(normalized_job)
            
            print(f"✅ {search_params['search_term']} in {search_params['location']}: {len(normalized_jobs)} jobs")
            return normalized_jobs
            
        except Exception as e:
            print(f"❌ Error scraping {search_params.get('search_term', 'unknown')}: {e}")
            return []
    
    def normalize_indeed_job(self, row):
        """Convert Indeed job to exact required format"""
        try:
            # Extract skills from description
            description = str(row.get('description', ''))
            skills = self.extract_comprehensive_skills(description)
            
            # Convert salary to integers
            salary_min = self.parse_salary_to_int(row.get('min_amount'))
            salary_max = self.parse_salary_to_int(row.get('max_amount'))
            
            normalized = {
                "title": str(row.get('title', '')).strip(),
                "description": description.strip(),
                "skills": skills,
                "salary_min": salary_min,
                "salary_max": salary_max,
                "experience_level": self.map_experience_level(row.get('job_level', ''), description),
                "growth_potential": self.estimate_growth_potential(str(row.get('title', ''))),
                "company": str(row.get('company', '')).strip(),
                "related_jobs": []
            }
            
            return normalized if normalized['title'] and normalized['company'] else None
        
        except Exception as e:
            return None
    
    def extract_comprehensive_skills(self, text):
        """Extract ALL types of skills - technical, soft, industry-specific"""
        # Comprehensive skills database for student platform
        all_skills = {
            # Programming & Technical
            'Python', 'JavaScript', 'Java', 'TypeScript', 'C++', 'C#', 'Go', 'Ruby', 'PHP', 'Swift', 'Kotlin',
            'React', 'Angular', 'Vue.js', 'Node.js', 'Django', 'Flask', 'Spring', 'HTML', 'CSS', 'SQL',
            'AWS', 'Azure', 'Google Cloud', 'Docker', 'Kubernetes', 'Git', 'Linux', 'MongoDB', 'PostgreSQL',
            
            # Data & Analytics
            'Machine Learning', 'AI', 'Data Science', 'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'R',
            'Tableau', 'Power BI', 'Excel', 'Statistics', 'Data Analysis', 'Big Data', 'Apache Spark',
            
            # Business & Finance
            'Financial Analysis', 'Accounting', 'Budgeting', 'Forecasting', 'Investment Analysis', 'Risk Management',
            'Project Management', 'Agile', 'Scrum', 'Business Analysis', 'Market Research', 'Strategic Planning',
            'CRM', 'Salesforce', 'QuickBooks', 'SAP', 'Oracle', 'Financial Modeling', 'Valuation',
            
            # Marketing & Sales
            'Digital Marketing', 'Social Media Marketing', 'SEO', 'SEM', 'Google Analytics', 'Content Marketing',
            'Email Marketing', 'PPC', 'Brand Management', 'Market Research', 'Lead Generation', 'Sales',
            'Customer Relationship Management', 'Adobe Creative Suite', 'Google Ads', 'Facebook Ads',
            
            # Design & Creative
            'Graphic Design', 'UI/UX Design', 'Adobe Photoshop', 'Adobe Illustrator', 'Figma', 'Sketch',
            'InDesign', 'Video Editing', 'After Effects', 'Premiere Pro', 'Photography', 'Branding',
            'Web Design', 'Prototyping', 'Wireframing', 'User Research',
            
            # Healthcare & Medical
            'Patient Care', 'Medical Terminology', 'HIPAA', 'Electronic Health Records', 'EHR', 'Clinical Research',
            'Pharmacy', 'Nursing', 'Physical Therapy', 'Laboratory Skills', 'Medical Coding', 'Healthcare Administration',
            
            # Education & Training
            'Curriculum Development', 'Lesson Planning', 'Educational Technology', 'Learning Management Systems',
            'Training and Development', 'Public Speaking', 'Tutoring', 'Assessment', 'Educational Research',
            
            # Soft Skills
            'Communication', 'Leadership', 'Team Collaboration', 'Problem Solving', 'Critical Thinking',
            'Time Management', 'Organization', 'Adaptability', 'Creativity', 'Analytical Thinking',
            'Customer Service', 'Negotiation', 'Conflict Resolution', 'Decision Making', 'Multitasking',
            'Attention to Detail', 'Work Ethic', 'Initiative', 'Reliability', 'Flexibility',
            
            # Languages
            'Spanish', 'French', 'German', 'Chinese', 'Japanese', 'Korean', 'Italian', 'Portuguese',
            'Arabic', 'Russian', 'Hindi', 'Bilingual', 'Multilingual', 'Translation', 'Interpretation',
            
            # Industry-Specific
            'Manufacturing', 'Quality Control', 'Lean Manufacturing', 'Six Sigma', 'Supply Chain',
            'Logistics', 'Inventory Management', 'Procurement', 'Vendor Management', 'Operations',
            'Real Estate', 'Property Management', 'Construction', 'Architecture', 'Engineering',
            'Legal Research', 'Contract Management', 'Compliance', 'Regulatory Affairs', 'Paralegal',
            
            # Tools & Software
            'Microsoft Office', 'Word', 'Excel', 'PowerPoint', 'Outlook', 'Teams', 'Slack', 'Zoom',
            'Jira', 'Confluence', 'Asana', 'Trello', 'Monday.com', 'HubSpot', 'Mailchimp', 'WordPress',
            
            # Certifications & Standards
            'PMP', 'Agile Certification', 'Six Sigma', 'ITIL', 'AWS Certified', 'Google Certified',
            'Salesforce Certified', 'CPA', 'CFA', 'PHR', 'SHRM', 'CompTIA', 'Cisco Certified'
        }
        
        found_skills = []
        text_lower = text.lower()
        
        for skill in all_skills:
            # Check for skill mentions with various formats
            skill_variations = [
                skill.lower(),
                skill.lower().replace('.', ''),
                skill.lower().replace(' ', ''),
                skill.lower().replace('-', ''),
                skill.lower().replace('/', ' ')
            ]
            
            if any(variation in text_lower for variation in skill_variations):
                found_skills.append(skill)
        
        # Remove duplicates and limit to 10 most relevant
        return list(dict.fromkeys(found_skills))[:10]
    
    def map_experience_level(self, level, description=""):
        """Map experience level using both job level and description"""
        level_indicators = f"{str(level)} {description}".lower()
        
        entry_keywords = ['entry', 'junior', 'jr', 'graduate', 'intern', 'trainee', 'associate', '0-2 years', 'new grad']
        senior_keywords = ['senior', 'sr', 'lead', 'principal', 'staff', 'director', 'manager', '5+ years', '7+ years', 'expert']
        
        if any(keyword in level_indicators for keyword in entry_keywords):
            return "Entry"
        elif any(keyword in level_indicators for keyword in senior_keywords):
            return "Senior"
        else:
            return "Mid"
    
    def estimate_growth_potential(self, title):
        """Estimate growth potential based on job title"""
        if not title:
            return "Medium"
        
        title_lower = title.lower()
        
        high_growth_fields = [
            'ai', 'artificial intelligence', 'machine learning', 'data scientist', 'cloud', 'cybersecurity',
            'software engineer', 'product manager', 'devops', 'blockchain', 'renewable energy', 'biotech',
            'fintech', 'healthtech', 'digital marketing', 'business development', 'sales', 'manager', 'director'
        ]
        
        if any(field in title_lower for field in high_growth_fields):
            return "High"
        else:
            return "Medium"
    
    def parse_salary_to_int(self, salary):
        """Convert salary to integer"""
        if not salary:
            return None
        try:
            if isinstance(salary, str):
                cleaned = salary.replace('$', '').replace(',', '').replace('k', '000').replace('K', '000')
                return int(float(cleaned))
            return int(salary)
        except:
            return None
    
    def generate_search_combinations(self):
        """Generate diverse search combinations"""
        combinations = []
        
        # Create search combinations with different locations
        for search_term in self.job_searches:
            # Pick random locations to distribute load
            selected_locations = random.sample(self.us_locations, min(3, len(self.us_locations)))
            
            for location in selected_locations:
                combinations.append({
                    'search_term': search_term,
                    'location': location,
                    'results_wanted': random.randint(15, 35)  # Vary results for diversity
                })
        
        # Shuffle for random order
        random.shuffle(combinations)
        return combinations
    
    def remove_duplicates(self, jobs):
        """Remove duplicate jobs"""
        seen = set()
        unique_jobs = []
        
        for job in jobs:
            key = f"{job.get('title', '').lower().strip()}|{job.get('company', '').lower().strip()}"
            if key not in seen and job.get('title') and job.get('company'):
                seen.add(key)
                unique_jobs.append(job)
        
        return unique_jobs
    
    def save_continuous_batch(self, jobs, batch_number):
        """Save each batch with timestamp"""
        if not jobs:
            return
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"us_jobs_batch_{batch_number}_{timestamp}.json"
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(jobs, f, indent=2, ensure_ascii=False)
        
        print(f"💾 Saved batch {batch_number}: {len(jobs)} jobs to {filename}")
    
    def run_continuous_scraping(self):
        """Main continuous scraping loop"""
        print("🚀 Starting Continuous US Jobs Scraping - Super Diverse Fields")
        print("🎯 Platform: Student Job Matching - ALL Skills Welcome")
        print("⚡ Processing: Multi-core parallel execution")
        print("🛑 Stop: Press Ctrl+C to gracefully shutdown")
        print("=" * 80)
        
        batch_number = 1
        total_unique_jobs = 0
        
        while not shutdown_flag:
            try:
                print(f"\n🔄 Starting Batch {batch_number} - {datetime.now().strftime('%H:%M:%S')}")
                
                # Generate diverse search combinations
                search_combinations = self.generate_search_combinations()
                batch_jobs = []
                
                # Process in smaller chunks to avoid overwhelming
                chunk_size = self.batch_size
                for i in range(0, len(search_combinations), chunk_size):
                    if shutdown_flag:
                        break
                    
                    chunk = search_combinations[i:i + chunk_size]
                    print(f"   📦 Processing chunk {i//chunk_size + 1} ({len(chunk)} searches)")
                    
                    # Use ProcessPoolExecutor for true parallelism
                    with ProcessPoolExecutor(max_workers=min(chunk_size, cpu_count())) as executor:
                        future_to_search = {executor.submit(self.scrape_job_batch, search): search for search in chunk}
                        
                        for future in as_completed(future_to_search):
                            if shutdown_flag:
                                break
                            try:
                                jobs = future.result(timeout=30)
                                batch_jobs.extend(jobs)
                            except Exception as e:
                                print(f"❌ Chunk error: {e}")
                    
                    # Brief pause between chunks
                    if not shutdown_flag:
                        time.sleep(random.uniform(2, 5))
                
                # Remove duplicates and save batch
                if batch_jobs:
                    unique_batch_jobs = self.remove_duplicates(batch_jobs)
                    total_unique_jobs += len(unique_batch_jobs)
                    
                    self.save_continuous_batch(unique_batch_jobs, batch_number)
                    
                    # Statistics
                    skills_count = {}
                    for job in unique_batch_jobs:
                        for skill in job.get('skills', []):
                            skills_count[skill] = skills_count.get(skill, 0) + 1
                    
                    top_skills = sorted(skills_count.items(), key=lambda x: x[1], reverse=True)[:5]
                    
                    print(f"\n📊 Batch {batch_number} Complete:")
                    print(f"   ✨ Unique jobs: {len(unique_batch_jobs)}")
                    print(f"   🎯 Total collected: {total_unique_jobs}")
                    print(f"   💡 Top skills: {', '.join([skill for skill, _ in top_skills])}")
                    
                    batch_number += 1
                
                # Longer pause between batches
                if not shutdown_flag:
                    pause_time = random.randint(30, 60)
                    print(f"⏳ Waiting {pause_time} seconds before next batch...")
                    for i in range(pause_time):
                        if shutdown_flag:
                            break
                        time.sleep(1)
            
            except KeyboardInterrupt:
                print("\n🛑 Received interrupt signal...")
                break
            except Exception as e:
                print(f"❌ Batch error: {e}")
                if not shutdown_flag:
                    time.sleep(10)  # Wait before retrying
        
        print(f"\n✅ Scraping completed! Total unique jobs collected: {total_unique_jobs}")
        print("📁 Check your directory for batch files: us_jobs_batch_*.json")

def main():
    """Main execution"""
    scraper = ContinuousJobScraper()
    scraper.run_continuous_scraping()

if __name__ == "__main__":
    main()