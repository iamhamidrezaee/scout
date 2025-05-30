# Scout - AI-Powered Career Discovery Platform

### UNDER DEVELOPMENT

Scout is an interactive career exploration platform that helps professionals discover their ideal career path through intelligent job matching and interactive visualizations. Built with a beautiful cream and brown color scheme, Scout provides an intuitive "Orb" visualization where users can explore job relationships and career progression paths.

## 🚀 Features

### 🎯 **Interactive Job Orb Visualization**
- **Dynamic Clustering**: Jobs automatically cluster based on similarity and relevance
- **Drag-and-Drop Interaction**: Drag jobs to create new clusters or make them central
- **Real-time Physics**: Smooth animations with collision detection and force simulation
- **Zoom and Pan**: Navigate through large job networks with ease

### 🔍 **Smart Job Search**
- **Multi-Algorithm Matching**: Combines TF-IDF, SVD, and cosine similarity for accurate results
- **Skill-based Search**: Search by skills, job titles, or natural language descriptions
- **Intelligent Filtering**: Keyword highlighting and real-time search suggestions
- **Relevance Scoring**: Jobs ranked by similarity, salary, and experience match

### 🎨 **Beautiful Design**
- **Cream & Brown Theme**: Warm, professional color palette
- **Transparent Nodes**: Clean visual design with colored borders (Navy for main jobs, Brown for related)
- **Glassmorphism Effects**: Modern blur effects and transparency
- **Particle Background**: Dynamic animated background

### 🧠 **Advanced Features**
- **Reinforcement Learning**: Hold Shift to select jobs for personalized recommendations
- **Favorites System**: Save interesting jobs for later review
- **Interactive Tooltips**: Rich job information on hover
- **Responsive Design**: Works on desktop, tablet, and mobile

## 🛠️ Installation & Setup

### Prerequisites
- Python 3.8 or higher
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Quick Start

1. **Clone or create the project directory**
   ```bash
   mkdir scout
   cd scout
   ```

2. **Create the following file structure:**
   ```
   scout/
   ├── app.py
   ├── init.json
   ├── requirements.txt
   ├── static/
   │   ├── style.css
   │   ├── map_styles.css
   │   ├── images/
   │   │   └── mag.png
   │   └── js/
   │       ├── base.js
   │       ├── jobMap.js
   │       └── mapUtils.js
   └── templates/
       └── map.html
   ```

3. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Add a search icon**
   - Create an `images` folder in `static/`
   - Add a magnifying glass icon as `mag.png` (any search icon will work)

5. **Start the application**
   ```bash
   python app.py
   ```

6. **Open your browser**
   Navigate to `http://localhost:5000`

## 🎯 How to Use Scout

### Basic Search
1. **Enter a job title or skills** in the search box (e.g., "Software Engineer", "Python Django", "Data Science")
2. **Press Enter** or wait for auto-search
3. **Explore the job orb** - the center node is your main match, surrounding nodes are related jobs

### Interactive Features

#### **Drag and Drop**
- **Drag a job near the center** → Makes it the new central job with fresh related jobs
- **Drag a job far away** → Creates a new cluster with that job as the center
- **Zoom in/out** → Use mouse wheel or zoom controls

#### **Reinforcement Mode**
- **Hold Shift** → Enter reinforcement mode
- **Click 1-3 jobs** → Select jobs you're interested in
- **Release Shift** → Get personalized recommendations based on your selections

#### **Keyword Filtering**
- **Type keywords** in the filter box (appears after search)
- **Matching jobs** will be highlighted with blue borders
- **Real-time filtering** as you type

### Job Information
- **Hover over jobs** → See detailed tooltips with salary, skills, and experience requirements
- **Click on jobs** → Open detailed job popup with full description and skills list
- **Heart icon** → Add jobs to favorites for later review

## 🔧 Customization

### Adding More Jobs

Edit `init.json` to add your own job data:

```json
{
  "title": "Your Job Title",
  "description": "Detailed job description here...",
  "skills": ["Skill1", "Skill2", "Skill3"],
  "salary_min": 75000,
  "salary_max": 120000,
  "experience_level": "Mid",
  "growth_potential": "High",
  "company": "Company Name"
}
```

### Color Customization

Modify the CSS variables in `style.css` and `map_styles.css`:

```css
:root {
  --cream-bg: #FAF7F2;        /* Background color */
  --brown-primary: #8B4513;    /* Main brown accent */
  --navy-blue: #1C3A5B;        /* Navy blue for main jobs */
  /* ... other colors */
}
```

### Adjusting Similarity Algorithm

In `app.py`, modify the similarity combination:

```python
# Combine lexical + latent similarity
alpha = 0.8  # Weight for TF-IDF vs SVD
combined = alpha * tfidf_scores[top_idxs] + (1 - alpha) * svd_scores
```

## 📊 Technical Details

### Algorithms Used
- **TF-IDF Vectorization**: Text similarity analysis for job descriptions and skills
- **Singular Value Decomposition (SVD)**: Dimensionality reduction for semantic matching
- **Cosine Similarity**: Vector-based job matching
- **K-Nearest Neighbors**: Find similar jobs efficiently
- **D3.js Force Simulation**: Physics-based node positioning

### Data Processing
- **Preprocessing**: Job data is vectorized and compressed for fast retrieval
- **Caching**: Similarity matrices are pre-computed and cached
- **Compression**: Uses LZMA compression for efficient storage

### Performance Features
- **Lazy Loading**: Clusters load as needed
- **Debounced Search**: Reduces API calls
- **Efficient Rendering**: Optimized D3.js animations
- **Memory Management**: Proper cleanup of event listeners

## 🎨 Color Scheme & Design

Scout uses a warm, professional color palette:

- **Cream Background** (#FAF7F2): Soft, easy on the eyes
- **Brown Accents** (#8B4513): Professional, warm
- **Navy Blue** (#1C3A5B): Trust, authority (for main job nodes)
- **Transparent Nodes**: Clean, modern look with colored borders
- **Glassmorphism**: Blur effects for modern UI elements

## 🔍 Browser Compatibility

- ✅ Chrome 80+
- ✅ Firefox 75+
- ✅ Safari 13+
- ✅ Edge 80+

## 🐛 Troubleshooting

### Common Issues

**Visualization not showing:**
- Check browser console for JavaScript errors
- Ensure all files are in correct directories
- Verify Flask server is running on port 5000

**Search not working:**
- Check that `init.json` contains valid job data
- Verify TF-IDF vectorization completed successfully
- Check server logs for preprocessing errors

**Jobs not clustering properly:**
- Increase the number of jobs in `init.json`
- Adjust similarity thresholds in the algorithm
- Check that job descriptions contain sufficient text

## 📝 File Structure

```
scout/
├── app.py                 # Flask backend server
├── init.json             # Job database
├── requirements.txt      # Python dependencies
├── precomputed/         # Generated similarity data (auto-created)
├── static/
│   ├── style.css        # Main styles
│   ├── map_styles.css   # Orb visualization styles
│   ├── images/
│   │   └── mag.png      # Search icon
│   └── js/
│       ├── base.js      # Particle background
│       ├── jobMap.js    # Main visualization logic
│       └── mapUtils.js  # Utility functions
└── templates/
    └── map.html         # Main HTML template
```

## 🚀 Future Enhancements

- **AI Chat Integration**: Natural language career counseling
- **Resume Analysis**: Upload resume for personalized job matching
- **Skill Gap Analysis**: Identify missing skills for target roles
- **Career Path Visualization**: Show progression routes between jobs
- **Company Data Integration**: Real job postings from APIs
- **Salary Trend Analysis**: Historical compensation data

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- **D3.js** - Powerful data visualization
- **Flask** - Lightweight web framework
- **scikit-learn** - Machine learning algorithms
- **Particles.js** - Beautiful background animations

---

**Scout** - Discover your perfect career path! 🚀