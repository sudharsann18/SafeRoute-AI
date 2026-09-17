# SafeRoute – AI-Powered Safe Route Recommendation System

SafeRoute is an AI-powered route recommendation system that goes beyond traditional shortest-path navigation by considering safety-related factors along a route.

Instead of focusing only on distance and travel time, SafeRoute analyzes factors such as crime risk, lighting, traffic, time of day, road risk, and distance to calculate a safety score and recommend a safer route.

## 🚀 Live Project

🔗 **Live Demo:** https://saferoute-ai-safety-dc6o.bolt.host

## 🎯 Problem Statement

Traditional navigation systems primarily optimize routes based on distance or travel time.

However, the shortest route may not always be the safest route.

SafeRoute addresses this by combining route information with safety analysis to help users compare different routes based on both travel efficiency and safety.

## 💡 Key Features

- 📍 Current location detection
- 🗺️ Interactive map-based navigation
- 🔎 Destination geocoding
- 🚗 Multiple route alternatives
- 🤖 Machine Learning based risk prediction
- 🛡️ Safety score calculation
- 🚦 Traffic risk analysis
- 💡 Lighting analysis
- 🚨 Crime risk analysis
- 🌙 Time-based risk analysis
- 🛣️ Road risk analysis
- 📊 Route-by-route safety comparison
- 🧭 Safety-aware route optimization using Dijkstra's algorithm

## 🏗️ System Architecture

```text
User
 │
 ▼
React Frontend
 │
 ├── Current Location
 ├── Destination
 │
 ▼
Nominatim Geocoding
 │
 ▼
OSRM Route Service
 │
 ▼
Multiple Route Alternatives
 │
 ├───────────────┐
 ▼               ▼
Safety Analysis  Random Forest
 │               │
 │               ▼
 │          Risk Prediction
 │
 ▼
Safety Score
 │
 ▼
Weighted Route Graph
 │
 ▼
Dijkstra's Algorithm
 │
 ▼
Recommended Safer Route
 │
 ▼
React Map & Route Analysis
