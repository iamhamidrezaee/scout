#!/usr/bin/env python3
"""
Simple script to combine all us_jobs_batch_*.json files into init.json
Usage: python combine_jobs.py
"""

import json
import glob
import os
from datetime import datetime

def combine_job_files():
    """Combine all batch job files into init.json"""
    
    # Find all batch files
    batch_files = glob.glob("us_jobs_batch_*.json")
    
    if not batch_files:
        print("❌ No batch files found (us_jobs_batch_*.json)")
        return
    
    print(f"🔍 Found {len(batch_files)} batch files:")
    for file in sorted(batch_files):
        print(f"   📄 {file}")
    
    # Combine all jobs
    all_jobs = []
    total_jobs_loaded = 0
    
    for file in sorted(batch_files):
        try:
            with open(file, 'r', encoding='utf-8') as f:
                batch_jobs = json.load(f)
                all_jobs.extend(batch_jobs)
                total_jobs_loaded += len(batch_jobs)
                print(f"✅ Loaded {len(batch_jobs)} jobs from {file}")
        except Exception as e:
            print(f"❌ Error loading {file}: {e}")
    
    # Remove duplicates based on title + company
    print(f"\n🔄 Removing duplicates...")
    seen = set()
    unique_jobs = []
    
    for job in all_jobs:
        # Create unique key from title and company
        title = job.get('title', '').lower().strip()
        company = job.get('company', '').lower().strip()
        key = f"{title}|{company}"
        
        if key not in seen and title and company:
            seen.add(key)
            unique_jobs.append(job)
    
    duplicates_removed = total_jobs_loaded - len(unique_jobs)
    
    # Save combined file
    try:
        with open('init.json', 'w', encoding='utf-8') as f:
            json.dump(unique_jobs, f, indent=2, ensure_ascii=False)
        
        print(f"\n✅ Successfully created init.json!")
        print(f"📊 Statistics:")
        print(f"   📁 Files processed: {len(batch_files)}")
        print(f"   📋 Total jobs loaded: {total_jobs_loaded}")
        print(f"   🗑️ Duplicates removed: {duplicates_removed}")
        print(f"   ✨ Unique jobs in init.json: {len(unique_jobs)}")
        
        # Show some stats about the combined data
        companies = set(job.get('company', '') for job in unique_jobs if job.get('company'))
        skills_count = {}
        
        for job in unique_jobs:
            for skill in job.get('skills', []):
                skills_count[skill] = skills_count.get(skill, 0) + 1
        
        top_skills = sorted(skills_count.items(), key=lambda x: x[1], reverse=True)[:10]
        
        print(f"\n📈 Data Overview:")
        print(f"   🏢 Unique companies: {len(companies)}")
        print(f"   💡 Most common skills: {', '.join([skill for skill, _ in top_skills[:5]])}")
        print(f"   💰 Jobs with salary info: {sum(1 for job in unique_jobs if job.get('salary_min'))}")
        
        # Show file size
        file_size = os.path.getsize('init.json') / 1024 / 1024  # MB
        print(f"   📦 File size: {file_size:.2f} MB")
        
    except Exception as e:
        print(f"❌ Error saving init.json: {e}")

def main():
    print("🔧 Job Batch Combiner")
    print("=" * 40)
    combine_job_files()
    print("\n🎉 Done!")

if __name__ == "__main__":
    main()