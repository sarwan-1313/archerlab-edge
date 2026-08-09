---
name: Precision Performance
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#bac9cc'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#849396'
  outline-variant: '#3b494c'
  surface-tint: '#00daf3'
  primary: '#c3f5ff'
  on-primary: '#00363d'
  primary-container: '#00e5ff'
  on-primary-container: '#00626e'
  inverse-primary: '#006875'
  secondary: '#b7c8e1'
  on-secondary: '#213145'
  secondary-container: '#3a4a5f'
  on-secondary-container: '#a9bad3'
  tertiary: '#e6edff'
  on-tertiary: '#263143'
  tertiary-container: '#c6d1e9'
  on-tertiary-container: '#4f5a6e'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#9cf0ff'
  primary-fixed-dim: '#00daf3'
  on-primary-fixed: '#001f24'
  on-primary-fixed-variant: '#004f58'
  secondary-fixed: '#d3e4fe'
  secondary-fixed-dim: '#b7c8e1'
  on-secondary-fixed: '#0b1c30'
  on-secondary-fixed-variant: '#38485d'
  tertiary-fixed: '#d8e3fb'
  tertiary-fixed-dim: '#bcc7de'
  on-tertiary-fixed: '#111c2d'
  on-tertiary-fixed-variant: '#3c475a'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  headline-md-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-padding: 24px
  gutter: 16px
  section-gap: 48px
  stack-sm: 8px
  stack-md: 16px
---

## Brand & Style

The design system is engineered for elite competitive archery, where precision, focus, and data integrity are paramount. The aesthetic follows a **Modern Corporate** approach with **Minimalist** and **Technical** influences, creating an environment that feels like a high-end laboratory or an aerospace cockpit. 

The UI prioritizes "visual silence"—eliminating unnecessary noise to ensure athletes and coaches can interpret biometric and performance data instantly. It evokes a sense of calm authority and professional-grade reliability through a dark-mode-first architecture, generous whitespace, and razor-sharp alignment.

## Colors

The palette is anchored in a "Deep Slate" spectrum to maintain focus and reduce eye strain during prolonged analysis.

- **Primary:** A refined Cyan (#00E5FF) used sparingly for key action triggers, success states, and critical data peaks. It is high-contrast but grounded by the dark surroundings.
- **Surface Tiers:** Backgrounds use a pure slate-black (#0F172A), while containers and cards use "Midnight" (#1E293B) to create subtle depth.
- **Accents:** Secondary grays (#64748B) are utilized for non-critical metadata and inactive states to maintain a clear hierarchy of importance.
- **Data Viz:** Use a cold spectrum (Teals, Silvers, and Indigos) for multi-series charts to avoid a cluttered "gaming" appearance.

## Typography

This design system utilizes a three-tier typographic scale to balance impact with technical clarity.

- **Headlines:** Hanken Grotesk provides a modern, sharp edge to the interface. Tight letter spacing on larger displays emphasizes the "edge" brand persona.
- **Body:** Inter is the workhorse for all long-form reading and settings, chosen for its exceptional legibility in dark mode interfaces.
- **Data & Labels:** JetBrains Mono is used for all numerical data, biometric readouts, and timestamps. Its monospaced nature ensures that fluctuating numbers don't cause layout "jitter" during real-time data streaming.

## Layout & Spacing

The layout utilizes a **12-column fixed grid** for desktop (max-width 1440px) to maintain a controlled, professional presentation of data dashboards. 

- **Rhythm:** A 4px baseline grid governs all vertical spacing. Elements should be spaced in multiples of 4 or 8.
- **Mobile:** Transition to a fluid 4-column grid with 16px side margins. 
- **Density:** High information density is preferred. Use tight "stack-sm" (8px) for related data points (e.g., heart rate + bpm label) and "stack-md" (16px) for distinct functional groups.

## Elevation & Depth

To maintain a "Precision-First" look, this design system avoids heavy, blurry shadows. Instead, it uses **Tonal Layers** and **Low-Contrast Outlines**.

- **Surfaces:** Depth is achieved by lightening the background hex by 2-4% for each successive layer. 
- **Borders:** All cards and interactive elements feature a 1px solid border. Use `rgba(255, 255, 255, 0.08)` for standard containers and the primary cyan at 30% opacity for focused or active states.
- **Glassmorphism:** Use a subtle backdrop blur (12px) on navigation bars and overlays to maintain context of the data underneath without sacrificing legibility.

## Shapes

The shape language is **Soft (0.25rem)**. This slight rounding provides a modern touch while maintaining the structural rigidity expected from a technical scientific tool. 

- **Standard Elements:** Inputs, buttons, and cards use the 4px (0.25rem) radius.
- **Data Markers:** Use 2px radius for small chart markers or "pill" tags for status indicators.
- **Icons:** Use thin-stroke (1.5px) icons with square terminals to match the technical font choices.

## Components

- **Action Buttons:** Primary buttons are solid Cyan with black text for maximum contrast. Secondary buttons use a ghost style (border only) with primary color text.
- **Data Cards:** Cards must have a clear header using "label-caps" typography. Internal padding is a strict 20px. Use subtle vertical separators for multi-metric cards.
- **Input Fields:** Darker than the card surface (#0F172A) with a 1px border. Focus state should glow slightly with a 2px Cyan outer stroke.
- **Charts:** Use thin, 2px lines for line graphs. Gradients should only be used as "area fills" below the line, transitioning from 10% Cyan to 0% opacity.
- **Status Chips:** Small, rectangular badges with low-saturation backgrounds (e.g., Deep Green for "Optimal", Deep Red for "Fatigue").
- **Biometric Feed:** A specialized component using "data-mono" for real-time streaming values, paired with a small pulsing "Live" indicator in the primary color.