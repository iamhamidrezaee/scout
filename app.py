#!/usr/bin/env python3
"""
app.py - Scout Career Discovery Platform API
Interactive job exploration with clustering and similarity analysis
"""

import gzip
import hashlib
import json
import os
import random
import time
import lzma
from pathlib import Path

import numpy as np
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS
from scipy import sparse
from scipy.sparse import csr_matrix
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import normalize

# Global config
DTYPE_ON_DISK = np.float16
SVD_COMPONENTS = 100
SPARSE_DTYPE_ON_DISK = np.float32
DENSE_DTYPE_ON_DISK = np.float16

# Load job data from JSON
current_directory = Path(__file__).resolve().parent
json_file_path = current_directory / "init.json"

try:
    print(f"[load] {json_file_path}")
    with open(json_file_path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    print(f"[load] ✓  {len(data):,} jobs")
except Exception as exc:
    print(f"[error] loading JSON – {exc}")
    data = []

# Tokenize job descriptions and skills for similarity analysis
def tokenize_job_content(job):
    """Tokenize job content for analysis"""
    content = f"{job.get('title', '')} {job.get('description', '')} {' '.join(job.get('skills', []))}"
    return content.lower().split()

for job in data:
    job["tokens"] = tokenize_job_content(job)

# Flask setup
app = Flask(__name__)
CORS(app)

# Cache locations
precompute_dir = current_directory / "precomputed"
precompute_dir.mkdir(exist_ok=True)

vectorizer_path = precompute_dir / "tfidf_vectorizer.pkl.gz"
tfidf_matrix_path = precompute_dir / "tfidf_matrix_fp16.npz"
svd_path = precompute_dir / "svd_model.xz"
docvecs_path = precompute_dir / "doc_vectors_fp16.npz"
similarities_path = precompute_dir / "similarities.pkl.gz"
data_hash_path = precompute_dir / "data_hash.txt"

# Check if we need to recompute
data_hash = hashlib.md5(
    json.dumps([{"title": d["title"], "description": d["description"]} for d in data])
    .encode()
).hexdigest()

need_recompute = True
if (
    all(p.exists() for p in (vectorizer_path, tfidf_matrix_path, docvecs_path, similarities_path, data_hash_path)) and
    svd_path.exists()
):
    if data_hash_path.read_text().strip() == data_hash:
        need_recompute = False

def modified_sigmoid(x):
    """Modified sigmoid for salary/experience scoring"""
    a = 0.2979
    b = -1.2902
    return 1 / (1 + np.exp(-(a * np.log(x + 1) + b)))

# Compute or load preprocessed data
if need_recompute:
    print("[build] Computing TF-IDF / SVD for jobs...")
    texts = [f"{d.get('title','')} {d.get('description','')} {' '.join(d.get('skills', []))}" for d in data]

    # TF-IDF
    vectorizer = TfidfVectorizer(
        stop_words="english",
        max_df=0.7,
        min_df=1,
        ngram_range=(1, 2),
    )
    tfidf_matrix = vectorizer.fit_transform(texts).astype(SPARSE_DTYPE_ON_DISK)

    # SVD
    svd = TruncatedSVD(n_components=SVD_COMPONENTS, random_state=42)
    doc_vectors = svd.fit_transform(tfidf_matrix.astype(np.float32))
    doc_vectors = normalize(doc_vectors, axis=1).astype(DENSE_DTYPE_ON_DISK)

    # Nearest neighbors for similarity
    nn = NearestNeighbors(n_neighbors=16, metric="cosine", algorithm="brute")
    nn.fit(doc_vectors.astype(np.float32))
    dist, idx = nn.kneighbors(doc_vectors)
    
    job_similarities = []
    for row_i, (row_idx, row_dist) in enumerate(zip(idx[:, 1:], dist[:, 1:])):
        sims = []
        for j, d_ in zip(row_idx, row_dist):
            salary_range = f"${data[j].get('salary_min', 0):,} - ${data[j].get('salary_max', 0):,}"
            sims.append({
                "id": j,
                "original_id": j,
                "title": data[j]["title"],
                "description": (data[j]["description"][:200] + " …") if len(data[j]["description"]) > 200 else data[j]["description"],
                "salary_range": salary_range,
                "experience_level": data[j].get("experience_level", "Not specified"),
                "score": float(1 - d_),
            })
        job_similarities.append(sims[:15])

    # Save computed data
    import pickle
    
    with gzip.open(vectorizer_path, "wb", compresslevel=9) as fh:
        pickle.dump(vectorizer, fh)

    sparse.save_npz(tfidf_matrix_path, tfidf_matrix)
    
    # Save SVD model
    svd_components = {
        'components_': svd.components_.astype(np.float16),
        'singular_values_': svd.singular_values_.astype(np.float32),
        'explained_variance_': svd.explained_variance_.astype(np.float32),
        'explained_variance_ratio_': svd.explained_variance_ratio_.astype(np.float32),
        'n_components': svd.n_components,
        'n_features_in_': svd.n_features_in_,
        'algorithm': svd.algorithm,
        'random_state': svd.random_state
    }
    
    with lzma.open(svd_path, 'wb', preset=9) as f:
        pickle.dump(svd_components, f)

    np.savez_compressed(docvecs_path, doc_vectors)

    with gzip.open(similarities_path, "wb", compresslevel=9) as fh:
        pickle.dump(job_similarities, fh)

    data_hash_path.write_text(data_hash)
    print("[build] ✓  pre-compute finished & cached")
else:
    print("[load] Using pre-computed data")
    import pickle

    with gzip.open(vectorizer_path, "rb") as fh:
        vectorizer = pickle.load(fh)

    tfidf_matrix = sparse.load_npz(tfidf_matrix_path).astype(np.float32)

    # Load SVD model
    with lzma.open(svd_path, 'rb') as f:
        svd_components = pickle.load(f)
    
    svd = TruncatedSVD(
        n_components=svd_components['n_components'],
        algorithm=svd_components['algorithm'],
        random_state=svd_components['random_state']
    )
    svd.components_ = svd_components['components_'].astype(np.float64)
    svd.singular_values_ = svd_components['singular_values_'].astype(np.float64)
    svd.explained_variance_ = svd_components['explained_variance_'].astype(np.float64)
    svd.explained_variance_ratio_ = svd_components['explained_variance_ratio_'].astype(np.float64)
    svd.n_features_in_ = svd_components['n_features_in_']

    doc_vectors = np.load(docvecs_path)["arr_0"].astype(np.float32)
    
    with gzip.open(similarities_path, "rb") as fh:
        job_similarities = pickle.load(fh)

    doc_vectors = normalize(doc_vectors, axis=1)

document_vectors_normalized = doc_vectors

def convert_to_serializable(obj):
    """Convert numpy types to Python standard types for JSON serialization"""
    import numpy as np
    if isinstance(obj, (np.int_, np.intc, np.intp, np.int8, np.int16, np.int32, np.int64,
                         np.uint8, np.uint16, np.uint32, np.uint64)):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, dict):
        return {convert_to_serializable(k): convert_to_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list) or isinstance(obj, tuple):
        return [convert_to_serializable(i) for i in obj]
    else:
        return obj

@app.route("/")
def home():
    return render_template('map.html', title="Scout Career Discovery")

@app.route("/search")
def search():
    query = request.args.get("query", "").strip()
    if not query:
        return jsonify([])

    # Check for exact job title match
    exact = [job for job in data if job.get("title", "").lower() == query.lower()]
    if exact:
        job = exact[0].copy()
        job["score"] = 1.0
        return jsonify(convert_to_serializable([job]))

    try:
        # Transform query into TF-IDF
        query_tfidf = vectorizer.transform([query])
        if query_tfidf.nnz == 0:
            # Fallback keyword scan
            lowq = query.lower()
            hits = []
            for job in data:
                if (lowq in job.get("title", "").lower() or 
                    lowq in job.get("description", "").lower() or
                    any(lowq in skill.lower() for skill in job.get("skills", []))):
                    hits.append(job)
                    if len(hits) >= 5:
                        break
            return jsonify(convert_to_serializable(hits))

        # Get TF-IDF cosine scores
        tfidf_scores = cosine_similarity(query_tfidf, tfidf_matrix).flatten()

        # Narrow down to top K by TF-IDF
        K = 50
        top_idxs = np.argsort(tfidf_scores)[::-1][:K]

        # Compute SVD-based similarity on those K
        query_svd = svd.transform(query_tfidf)
        query_norm = normalize(query_svd)[0]
        candidates = document_vectors_normalized[top_idxs]
        svd_scores = candidates.dot(query_norm)

        # Combine lexical + latent
        alpha = 0.8
        combined = alpha * tfidf_scores[top_idxs] + (1 - alpha) * svd_scores

        # Boost by salary (using median salary as proxy for job attractiveness)
        boost_factor = 0.2
        boosted = []
        for idx_pos, job_idx in enumerate(top_idxs):
            base_score = combined[idx_pos]
            salary_min = data[job_idx].get("salary_min", 0)
            salary_max = data[job_idx].get("salary_max", 0)
            median_salary = (salary_min + salary_max) / 2 if salary_max > 0 else salary_min
            boost = modified_sigmoid(median_salary / 1000)  # Normalize salary
            final_score = base_score * (1 + boost_factor * min(0, (boost - 0.5)) * 2)
            boosted.append((job_idx, final_score))

        # Pick top N results
        N = 7
        best = sorted(boosted, key=lambda x: x[1], reverse=True)[:N]

        # Build result list
        results = []
        for idx, score in best:
            job = data[idx].copy()
            job["score"] = float(score)
            results.append(job)

        print(f"Search returned {len(results)} results")
    except Exception as e:
        print(f"Error during search: {e}")
        results = []

    return jsonify(convert_to_serializable(results))

@app.route("/map_data")
def map_data():
    """Render job map visualization data"""
    query = request.args.get("query", "")
    if not query:
        return jsonify({"center": None, "related": []})
    
    try:
        # Check for exact title matches first
        exact_match_idx = None
        for idx, job in enumerate(data):
            if job.get("title", "").lower() == query.lower():
                exact_match_idx = idx
                break
        
        if exact_match_idx is not None:
            center_job = data[exact_match_idx]
            
            # Get related jobs from precomputed similarities
            related_jobs = []
            if exact_match_idx < len(job_similarities):
                similar_jobs = job_similarities[exact_match_idx]
                
                for similar_job in similar_jobs:
                    similar_id = similar_job.get("original_id")
                    if similar_id is not None and similar_id >= 0 and similar_id < len(data):
                        similar_job["salary_min"] = data[similar_id].get("salary_min", 0)
                        similar_job["salary_max"] = data[similar_id].get("salary_max", 0)
                
                related_jobs = similar_jobs
            
            # Format data for visualization
            map_data = {
                "center": {
                    "id": 0,
                    "original_id": exact_match_idx,
                    "title": center_job.get("title", "Unknown"),
                    "description": center_job.get("description", ""),
                    "salary_min": center_job.get("salary_min", 0),
                    "salary_max": center_job.get("salary_max", 0),
                    "experience_level": center_job.get("experience_level", "Not specified"),
                    "skills": center_job.get("skills", []),
                    "score": 1.0,
                },
                "related": related_jobs
            }
            
            map_data = convert_to_serializable(map_data)
            return jsonify(map_data)
        
        # If no exact match, use search similarity
        query_tfidf = vectorizer.transform([query])
        if query_tfidf.sum() == 0:
            return jsonify({"center": None, "related": []})
        
        query_svd = svd.transform(query_tfidf)
        query_normalized = normalize(query_svd)
        
        scores = query_normalized @ document_vectors_normalized.T
        top_indices = np.argsort(scores[0])[::-1][:5]
        results = [data[i] for i in top_indices]
        
        if not results or len(results) == 0:
            return jsonify({"center": None, "related": []})
        
        center_job = results[0]
        
        # Find the index of this job
        center_index = None
        for i, job in enumerate(data):
            if job.get("title") == center_job.get("title"):
                center_index = i
                break
        
        # Get related jobs
        related_jobs = []
        if center_index is not None and center_index < len(job_similarities):
            similar_jobs = job_similarities[center_index]
            
            for similar_job in similar_jobs:
                similar_id = similar_job.get("original_id")
                if similar_id is not None and similar_id >= 0 and similar_id < len(data):
                    similar_job["salary_min"] = data[similar_id].get("salary_min", 0)
                    similar_job["salary_max"] = data[similar_id].get("salary_max", 0)
            
            related_jobs = similar_jobs
        else:
            # Fallback: use next top search results
            for i, job in enumerate(results[1:16], 1):
                related_jobs.append({
                    "id": i,
                    "original_id": -1,
                    "title": job.get("title", "Unknown"),
                    "description": job.get("description", ""),
                    "salary_min": job.get("salary_min", 0),
                    "salary_max": job.get("salary_max", 0),
                    "experience_level": job.get("experience_level", "Not specified"),
                    "score": max(0.3, 1.0 - (i * 0.05)),
                })
        
        # Format data
        map_data = {
            "center": {
                "id": 0,
                "original_id": center_index,
                "title": center_job.get("title", "Unknown"),
                "description": center_job.get("description", ""),
                "salary_min": center_job.get("salary_min", 0),
                "salary_max": center_job.get("salary_max", 0),
                "experience_level": center_job.get("experience_level", "Not specified"),
                "skills": center_job.get("skills", []),
                "score": 1.0,
            },
            "related": related_jobs
        }
        
        map_data = convert_to_serializable(map_data)
        return jsonify(map_data)
        
    except Exception as e:
        print(f"Error generating map data: {str(e)}")
        return jsonify({"center": None, "related": [], "error": str(e)})

@app.route("/job_as_query")
def job_as_query():
    """API endpoint to use a specific job as the query center"""
    job_id_str = request.args.get("job_id", "")
    
    try:
        job_id = int(job_id_str)
        print(f"Using job ID {job_id} as query center")
        
        if job_id < 0 or job_id >= len(data):
            print(f"Invalid job ID: {job_id}")
            return jsonify({"center": None, "related": [], "error": "Invalid job ID"})
        
        start_time = time.time()
        
        # Get the center job data
        center_job = data[job_id]
        
        # Get related jobs from precomputed similarity matrix
        related_jobs = []
        if job_id < len(job_similarities):
            similar_jobs = job_similarities[job_id]
            
            for i, similar_job in enumerate(similar_jobs):
                original_id = similar_job.get("original_id")
                
                if original_id is not None and original_id >= 0 and original_id < len(data):
                    # Add missing data from original job
                    similar_job["salary_min"] = data[original_id].get("salary_min", 0)
                    similar_job["salary_max"] = data[original_id].get("salary_max", 0)
                    similar_job["skills"] = data[original_id].get("skills", [])
                
                related_jobs.append({
                    "id": i + 1,
                    "original_id": original_id,
                    "title": similar_job.get("title"),
                    "description": similar_job.get("description"),
                    "salary_min": similar_job.get("salary_min", 0),
                    "salary_max": similar_job.get("salary_max", 0),
                    "experience_level": similar_job.get("experience_level", "Not specified"),
                    "score": similar_job.get("score"),
                })
        
        # Format data for visualization
        map_data = {
            "center": {
                "id": 0,
                "original_id": job_id,
                "title": center_job.get("title", "Unknown"),
                "description": center_job.get("description", ""),
                "salary_min": center_job.get("salary_min", 0),
                "salary_max": center_job.get("salary_max", 0),
                "experience_level": center_job.get("experience_level", "Not specified"),
                "skills": center_job.get("skills", []),
                "score": 1.0,
            },
            "related": related_jobs
        }
        
        end_time = time.time()
        print(f"Job-as-query map data generated in {end_time - start_time:.2f} seconds")
        
        map_data = convert_to_serializable(map_data)
        return jsonify(map_data)
        
    except ValueError:
        print(f"Invalid job ID format: {job_id_str}")
        return jsonify({"center": None, "related": [], "error": "Invalid job ID format"})
    except Exception as e:
        print(f"Error generating job-as-query map: {str(e)}")
        return jsonify({"center": None, "related": [], "error": str(e)})

@app.route("/reinforce", methods=['POST'])
def reinforce():
    """Endpoint to handle job reinforcement"""
    request_data = request.get_json()
    center_id = request_data.get('center_id')
    selected_ids = request_data.get('selected_ids', [])
    
    if center_id is None or not selected_ids:
        return jsonify({"error": "Invalid request data"}), 400
    
    try:
        center_id = int(center_id)
        selected_ids = [int(sid) for sid in selected_ids]
        
        if center_id < 0 or center_id >= len(data) or any(sid < 0 or sid >= len(data) for sid in selected_ids):
            return jsonify({"error": "Invalid job IDs"}), 400
        
        # Get center job data
        center_job = data[center_id]
        
        # For each selected job, find its most similar jobs
        all_similar_jobs = []
        seen_ids = set([center_id] + selected_ids)
        
        for sid in selected_ids:
            if sid < len(job_similarities):
                similar_jobs = job_similarities[sid]
                for job in similar_jobs:
                    original_id = job.get("original_id")
                    if original_id is not None and original_id not in seen_ids:
                        all_similar_jobs.append((job, float(job.get("score", 0))))
                        seen_ids.add(original_id)
        
        # Sort by score and take top N
        all_similar_jobs.sort(key=lambda x: x[1], reverse=True)
        top_similar_jobs = []
        
        # Include the selected jobs themselves
        for i, sid in enumerate(selected_ids):
            job_data = data[sid]
            top_similar_jobs.append({
                "id": i + 1,
                "original_id": sid,
                "title": job_data.get("title", "Unknown"),
                "description": job_data.get("description", ""),
                "salary_min": job_data.get("salary_min", 0),
                "salary_max": job_data.get("salary_max", 0),
                "experience_level": job_data.get("experience_level", "Not specified"),
                "score": 0.95,
            })
        
        # Add most similar jobs to fill up to 15 total
        next_id = len(selected_ids) + 1
        for job, score in all_similar_jobs:
            if len(top_similar_jobs) >= 15:
                break
            
            original_id = job.get("original_id")
            if original_id is not None and original_id < len(data):
                job_data = data[original_id]
                top_similar_jobs.append({
                    "id": next_id,
                    "original_id": original_id,
                    "title": job_data.get("title", job.get("title", "Unknown")),
                    "description": job_data.get("description", job.get("description", "")),
                    "salary_min": job_data.get("salary_min", 0),
                    "salary_max": job_data.get("salary_max", 0),
                    "experience_level": job_data.get("experience_level", "Not specified"),
                    "score": score,
                })
                next_id += 1
        
        # Fill with random jobs if needed
        while len(top_similar_jobs) < 15:
            random_id = random.randint(0, len(data) - 1)
            if random_id not in seen_ids:
                job_data = data[random_id]
                top_similar_jobs.append({
                    "id": next_id,
                    "original_id": random_id,
                    "title": job_data.get("title", "Unknown"),
                    "description": job_data.get("description", ""),
                    "salary_min": job_data.get("salary_min", 0),
                    "salary_max": job_data.get("salary_max", 0),
                    "experience_level": job_data.get("experience_level", "Not specified"),
                    "score": 0.5,
                })
                seen_ids.add(random_id)
                next_id += 1
        
        # Format response
        response_data = {
            "center": {
                "id": 0,
                "original_id": center_id,
                "title": center_job.get("title", "Unknown"),
                "description": center_job.get("description", ""),
                "salary_min": center_job.get("salary_min", 0),
                "salary_max": center_job.get("salary_max", 0),
                "experience_level": center_job.get("experience_level", "Not specified"),
                "skills": center_job.get("skills", []),
                "score": 1.0,
            },
            "related": top_similar_jobs
        }
        
        response_data = convert_to_serializable(response_data)
        return jsonify(response_data)
    
    except Exception as e:
        print(f"Error in reinforcement: {str(e)}")
        return jsonify({"error": str(e)}), 500 

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)