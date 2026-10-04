# ArcherLab Edge

## From an Athlete's Problem to an Engineering Solution

### Privacy-first computer vision and performance analytics for precision archery

---

<p align="center">
  <b>Transforming athletic experience into computational insight.</b>
</p>

---

## The Story Behind ArcherLab Edge

ArcherLab Edge began with a question from my own experience as an archer:

> **Can technology help an athlete better understand the small details that influence performance consistency?**

Precision sports are often decided by details that are difficult to observe:

- movement stability;
- body alignment;
- repeatability between attempts;
- changes across training sessions;
- relationships between technique and results.

Traditional performance analysis often requires expensive sensors, specialized equipment, or manual review.

As both an athlete and a computer science student, I wanted to explore whether modern software engineering and computer vision could make performance analysis more accessible.

That idea became **ArcherLab Edge**.

A system built at the intersection of:

- Precision Athletics
- Computer Vision
- Biomechanics
- Statistical Analysis
- Privacy-Preserving Computing

---

# Project Vision

ArcherLab Edge explores a simple idea:

> **Can a standard consumer device become an intelligent training tool while keeping athlete data local?**

The project investigates how browser-based computer vision and software engineering can help athletes visualize, analyze, and understand performance patterns.

Rather than building a generic AI demonstration, ArcherLab Edge applies technology to a real domain problem experienced through competitive archery.

---

# What ArcherLab Edge Does

ArcherLab Edge is a browser-based sports analytics platform combining:

- on-device computer vision;
- movement analysis;
- biomechanics estimation;
- shot-cycle analysis;
- gesture interaction;
- local session recording;
- performance analytics;
- experimental statistical modeling.

---

# Core Capabilities

## 1. On-Device Computer Vision

ArcherLab Edge uses MediaPipe Tasks Vision for local browser-based analysis.

Implemented capabilities:

- Pose Landmarker integration
- Hand Landmarker integration
- athlete detection
- skeleton visualization
- landmark processing
- movement tracking
- confidence-based quality handling
- temporal smoothing

The system is designed without requiring cloud video inference.

---

# 2. Biomechanics Analysis Engine

The biomechanics layer converts movement landmarks into archery-focused measurements.

Current analysis includes:

- shoulder alignment;
- bow-arm geometry;
- torso positioning;
- head movement stability;
- bow-hand movement;
- temporal consistency;
- movement variation analysis.

The biomechanics system is separated from the interface layer, allowing calculations and visualization to evolve independently.

---

# 3. Shot Cycle Intelligence

Archery performance is not only a single frame — it is a sequence of movements.

ArcherLab Edge analyzes shot phases through:

- shot buffering;
- release-event capture;
- pre-release analysis;
- post-release analysis;
- release metrics;
- shot-quality summaries;
- follow-through analysis.

Automatic release recognition remains an experimental capability.

---

# 4. Touchless Athlete Interaction

The application includes an optional gesture-based interaction system.

Features include:

- hand landmark processing;
- gesture classification;
- finger counting;
- stability confirmation;
- score association;
- gesture diagnostics;
- manual fallback input.

The goal is to allow athletes to interact with sessions while maintaining shooting workflow.

---

# 5. Session Recording and Replay

Training improvement requires reviewing both results and process.

ArcherLab Edge includes:

- local recording workflows;
- session management;
- replay analysis;
- performance review;
- session-based analytics.

The architecture separates recorded data from analytical data, allowing future improvements without recreating training sessions.

---

# 6. Performance Analytics

The analytics system transforms training sessions into measurable information.

Implemented analysis includes:

- target coordinate handling;
- shot grouping;
- centroid calculations;
- spread analysis;
- session statistics;
- performance comparisons.

Statistical outputs are designed for exploration and understanding rather than unsupported coaching claims.

---

# 7. Experimental Performance Modeling

ArcherLab Edge includes an experimental statistical modeling layer.

The system explores:

- shot distributions;
- athlete-specific variation;
- simulated shot clouds;
- uncertainty visualization.

This component is experimental and is not presented as an exact arrow-impact predictor.

---

# System Architecture

```text
Camera Input
      |
      v
Local MediaPipe Processing
      |
      +----------------+
      |                |
      v                v
Pose Analysis     Hand Analysis
      |                |
      v                v
Biomechanics     Gesture Interaction
      |
      v
Shot Analysis
      |
      v
Target Analytics
      |
      v
Session Intelligence
      |
      v
Experimental Modeling
```

---

# Privacy-First Architecture

A core design principle of ArcherLab Edge is local processing.

```text
Camera
   |
   v
Local Vision Models
   |
   v
Movement Landmarks
   |
   v
Biomechanics Analysis
   |
   v
Local Session Data
```

The platform is designed around:

- local computation;
- user-owned data;
- minimal external dependencies;
- privacy-conscious architecture.

---

# Technology Stack

## Frontend

- React
- TypeScript
- Vite

## Computer Vision

- MediaPipe Tasks Vision
- Pose Landmarker
- Hand Landmarker
- WebAssembly runtime

## Browser Technologies

- Camera APIs
- Browser media workflows
- Local storage systems
- Canvas/SVG visualization

## Engineering Practices

- modular architecture;
- reusable components;
- custom React hooks;
- typed domain models;
- analytical utilities;
- automated testing.

---

# Engineering Highlights

## Domain-Driven Development

The project was created around a real problem from athletic experience rather than as an isolated technology experiment.

## Computer Vision Application

The system applies computer vision toward understanding movement patterns, not only detecting objects.

## Separation of Concerns

Camera processing, biomechanics, analytics, recording, and visualization are structured as independent modules.

## Temporal Understanding

The platform analyzes movement over time instead of treating every frame independently.

## Responsible Analytics

Experimental features are clearly separated from validated measurements.

## Complete Product Workflow

The application includes:

- calibration;
- live analysis;
- sessions;
- recording;
- replay;
- profiles;
- analytics.

---

# Repository Structure

```text
src/
├── analytics
├── biomechanics
├── components
├── gesture-entry
├── hooks
├── pages
├── profile
├── recording
├── services
├── shot-analysis
├── simulation
├── target
├── types
└── utils
```

---

# Technology Challenges Solved

Building ArcherLab Edge required solving challenges across multiple areas:

### Real-time browser computer vision

Integrating vision models while maintaining interactive performance.

### Movement analysis

Converting raw landmarks into meaningful domain-specific measurements.

### Temporal processing

Understanding motion sequences instead of isolated observations.

### Local-first architecture

Designing around privacy and browser capabilities.

### Product engineering

Creating a complete athlete workflow rather than a single technical demonstration.

---
# Screenshots

## Live Analysis

The primary analysis workflow combines local camera processing, biomechanics visualization, and performance metrics.

![Live Analysis](docs/images/hero-live-analysis.png)

---

## Session Dashboard

Session analytics provide an overview of training performance and measured indicators.

![Session Dashboard](docs/images/session-dashboard.png)

# Current Status

## ArcherLab Edge v0.1.0

Experimental engineering prototype.

## Guide deep links

The interactive manual uses browser-history routes such as `/guide/camera-setup`,
`/guide/review-shots`, and `/guide/analytics`. Development and Vite preview
serve these routes through the single-page application automatically. A static
production host must rewrite unknown application paths to `index.html` so a
refresh or direct visit to a guide detail URL can load the app.

Current focus:

- validating the technical foundation;
- exploring browser-based sports intelligence;
- creating a foundation for future athlete-centered research.

---

# Limitations

ArcherLab Edge is an experimental prototype.

Current limitations:

- biomechanics outputs are not medically validated;
- gesture scoring represents athlete input;
- automatic release detection remains experimental;
- simulation outputs are exploratory;
- the system is not a professional coaching replacement;
- the system is not a medical device.

These limitations are intentionally documented as part of responsible engineering practice.

---

# Future Direction

## v0.2

- improved robustness;
- stronger interaction workflows;
- enhanced user experience.

## v0.3

- richer session analytics;
- improved comparisons;
- deeper visualization.

## v0.5

- athlete-specific datasets;
- personalized performance models;
- expanded experimentation.

## v1.0

A mature computational sports-performance platform.

---

# Why I Built This

A problem experienced as an athlete became a technical question.

That question became an engineering challenge.

That engineering challenge became ArcherLab Edge.

This project represents the intersection of two disciplines:

**the precision of athletics and the creativity of computer science.**

---

## Version

**ArcherLab Edge v0.1.0**

Experimental public engineering prototype.
