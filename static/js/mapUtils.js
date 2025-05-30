// mapUtils.js - Utility functions for Scout job map visualization

// Function to add a persistent legend to the job orb visualization
function addPersistentOrbLegend() {
    // Remove any existing legend first
    const existingLegend = document.querySelector('.orb-legend');
    if (existingLegend) {
      existingLegend.remove();
    }
    
    // Create the legend container
    const legend = document.createElement('div');
    legend.className = 'orb-legend';
    
    // Add legend content with styled elements
    legend.innerHTML = `
      <h3>Career Orb Guide</h3>
      <div class="legend-section">
        <div class="legend-title">Node Colors</div>
        <div class="legend-item">
          <div class="color-gradient">
            <span class="gradient-dark"></span>
            <span class="gradient-light"></span>
          </div>
          <div class="legend-desc">Navy: Main job → Brown: Related jobs</div>
        </div>
      </div>
      
      <div class="legend-section">
        <div class="legend-title">Node Size</div>
        <div class="legend-item">
          <div class="size-gradient">
            <span class="size-small"></span>
            <span class="size-medium"></span>
            <span class="size-large"></span>
          </div>
          <div class="legend-desc">Size indicates salary range and relevance</div>
        </div>
      </div>
      
      <div class="legend-section">
        <div class="legend-title">Interaction</div>
        <div class="legend-item with-icon">
          <div class="drag-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 8C14 9.1 13.1 10 12 10C10.9 10 10 9.1 10 8C10 6.9 10.9 6 12 6C13.1 6 14 6.9 14 8Z"></path>
              <path d="M12 12L12 18"></path>
              <path d="M12 12L16 14"></path>
              <path d="M12 12L8 14"></path>
            </svg>
          </div>
          <div class="legend-desc">Drag jobs away from center to create new clusters or make them central</div>
        </div>
      </div>
      
      <div class="legend-section">
        <div class="legend-title">Features</div>
        <div class="legend-item">
          <div style="width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; background-color: rgba(139, 69, 19, 0.2); border-radius: 4px; color: #8B4513;">
            <i class="fas fa-search" style="font-size: 12px;"></i>
          </div>
          <div class="legend-desc">Use keyword filter to highlight matching jobs</div>
        </div>
      </div>
      
      <div class="legend-section">
        <div class="legend-title">Reinforcement</div>
        <div class="legend-item">
          <div style="width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; background-color: rgba(28, 58, 91, 0.2); border-radius: 4px; color: #1C3A5B;">
            <i class="fas fa-plus" style="font-size: 12px;"></i>
          </div>
          <div class="legend-desc">Hold Shift to select jobs for reinforcement learning</div>
        </div>
      </div>
    `;
    
    // Add toggle button for minimizing/maximizing legend
    const toggleBtn = document.createElement('div');
    toggleBtn.className = 'orb-legend-toggle';
    toggleBtn.innerHTML = '−';
    toggleBtn.title = 'Minimize/Maximize';
    
    toggleBtn.addEventListener('click', () => {
      if (legend.classList.contains('minimized')) {
        legend.classList.remove('minimized');
        toggleBtn.innerHTML = '−';
      } else {
        legend.classList.add('minimized');
        toggleBtn.innerHTML = '+';
      }
    });
    
    legend.appendChild(toggleBtn);
    
    // Add legend to the full-body-container instead of map-container
    // This will make it persist even if the map container is cleared
    const fullBodyContainer = document.querySelector('.full-body-container');
    if (fullBodyContainer) {
      fullBodyContainer.appendChild(legend);
    }
  }

// Function to create a job information card
function createJobInfoCard(job) {
    const card = document.createElement('div');
    card.className = 'job-info-card';
    
    const salaryRange = job.salary_min && job.salary_max ? 
        `$${job.salary_min.toLocaleString()} - $${job.salary_max.toLocaleString()}` : 
        "Salary not specified";
    
    const skills = job.skills && job.skills.length > 0 ? 
        job.skills.slice(0, 5).join(", ") : 
        "No skills specified";
    
    card.innerHTML = `
        <div class="job-card-header">
            <h4 class="job-card-title">${job.title}</h4>
            <div class="job-card-salary">${salaryRange}</div>
        </div>
        <div class="job-card-body">
            <p class="job-card-description">${job.description || "No description available"}</p>
            <div class="job-card-meta">
                <div class="job-card-experience">Experience: ${job.experience_level || "Not specified"}</div>
                <div class="job-card-skills">Skills: ${skills}</div>
            </div>
        </div>
    `;
    
    return card;
}

// Function to format salary for display
function formatSalary(salaryMin, salaryMax) {
    if (!salaryMin && !salaryMax) return "Salary not specified";
    if (salaryMin && salaryMax) {
        return `$${salaryMin.toLocaleString()} - $${salaryMax.toLocaleString()}`;
    }
    if (salaryMin) return `From $${salaryMin.toLocaleString()}`;
    if (salaryMax) return `Up to $${salaryMax.toLocaleString()}`;
    return "Salary not specified";
}

// Function to get experience level color
function getExperienceLevelColor(level) {
    switch (level?.toLowerCase()) {
        case 'entry':
            return '#D2B48C'; // Light brown
        case 'mid':
            return '#A0522D'; // Medium brown
        case 'senior':
            return '#8B4513'; // Dark brown
        default:
            return '#A0522D'; // Default medium brown
    }
}

// Function to create skill tags
function createSkillTags(skills, maxSkills = 5) {
    if (!skills || !Array.isArray(skills)) return '';
    
    const displaySkills = skills.slice(0, maxSkills);
    const remainingCount = skills.length - maxSkills;
    
    let tagsHtml = displaySkills.map(skill => 
        `<span class="skill-tag">${skill}</span>`
    ).join('');
    
    if (remainingCount > 0) {
        tagsHtml += `<span class="skill-tag skill-tag-more">+${remainingCount} more</span>`;
    }
    
    return tagsHtml;
}

// Function to calculate job similarity score display
function getJobSimilarityDisplay(score) {
    if (score >= 0.9) return { text: "Excellent Match", class: "excellent" };
    if (score >= 0.8) return { text: "Very Good Match", class: "very-good" };
    if (score >= 0.7) return { text: "Good Match", class: "good" };
    if (score >= 0.6) return { text: "Fair Match", class: "fair" };
    return { text: "Basic Match", class: "basic" };
}

// Function to export job data
function exportJobData(jobs, format = 'json') {
    const dataStr = format === 'json' ? 
        JSON.stringify(jobs, null, 2) : 
        convertJobsToCSV(jobs);
    
    const dataBlob = new Blob([dataStr], { 
        type: format === 'json' ? 'application/json' : 'text/csv' 
    });
    
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `scout-jobs-${new Date().toISOString().split('T')[0]}.${format}`;
    link.click();
    URL.revokeObjectURL(url);
}

// Function to convert jobs to CSV format
function convertJobsToCSV(jobs) {
    if (!jobs || jobs.length === 0) return '';
    
    const headers = ['Title', 'Description', 'Salary Min', 'Salary Max', 'Experience Level', 'Skills'];
    const csvRows = [headers.join(',')];
    
    jobs.forEach(job => {
        const row = [
            `"${job.title || ''}"`,
            `"${(job.description || '').replace(/"/g, '""')}"`,
            job.salary_min || '',
            job.salary_max || '',
            job.experience_level || '',
            `"${(job.skills || []).join('; ')}"`
        ];
        csvRows.push(row.join(','));
    });
    
    return csvRows.join('\n');
}

// Function to validate job data
function validateJobData(job) {
    const errors = [];
    
    if (!job.title || job.title.trim() === '') {
        errors.push('Job title is required');
    }
    
    if (!job.description || job.description.trim() === '') {
        errors.push('Job description is required');
    }
    
    if (job.salary_min && job.salary_max && job.salary_min > job.salary_max) {
        errors.push('Minimum salary cannot be greater than maximum salary');
    }
    
    if (job.skills && !Array.isArray(job.skills)) {
        errors.push('Skills must be an array');
    }
    
    return errors;
}

// Function to generate job search suggestions
function generateJobSearchSuggestions(query, jobs) {
    if (!query || query.trim() === '') return [];
    
    const queryLower = query.toLowerCase();
    const suggestions = new Set();
    
    // Add job titles that match
    jobs.forEach(job => {
        if (job.title && job.title.toLowerCase().includes(queryLower)) {
            suggestions.add(job.title);
        }
        
        // Add skills that match
        if (job.skills && Array.isArray(job.skills)) {
            job.skills.forEach(skill => {
                if (skill.toLowerCase().includes(queryLower)) {
                    suggestions.add(skill);
                }
            });
        }
    });
    
    return Array.from(suggestions).slice(0, 8); // Limit to 8 suggestions
}

// Function to create a loading spinner
function createLoadingSpinner(message = 'Loading...') {
    const spinner = document.createElement('div');
    spinner.className = 'scout-loading-spinner';
    spinner.innerHTML = `
        <div class="spinner-container">
            <div class="spinner"></div>
            <div class="spinner-message">${message}</div>
        </div>
    `;
    return spinner;
}

// Function to debounce function calls
function debounce(func, wait, immediate) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            timeout = null;
            if (!immediate) func.apply(this, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(this, args);
    };
}

// Function to throttle function calls
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}