# Diagnostic Engine

Next.js-based diagnostic assessment engine for NeuroSync.

## Features

- **ASD/ADHD Assessments**: M-CHAT, DSM-V screening
- **ID (Intellectual Disability)**: GLAD assessment suite
- **SLD (Specific Learning Disabilities)**: WIAT-based screening
- **Auto-Scoring**: Automated scoring with instant feedback
- **Report Generation**: PDF export and email sharing
- **Multi-language**: EN, HI, MR support

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
npm start
```

## Project Structure

```
src/
├── pages/
│   ├── categories/          # Category-specific assessments
│   ├── index.tsx           # Home/selection page
│   └── _app.tsx            # App wrapper
├── lib/
│   ├── config/             # Assessment configurations
│   ├── scoring/            # Scoring algorithms
│   ├── store/              # Zustand state management
│   └── types/              # TypeScript definitions
├── shared/
│   ├── components/         # Shared UI components
│   ├── hooks/              # Custom React hooks
│   └── lib/                # Utility functions
└── styles/
    └── globals.css         # Global styles
```

## Assessment Categories

### ASD/ADHD
- M-CHAT (Modified Checklist for Autism in Toddlers)
- DSM-V criteria screening

### ID (Intellectual Disability)
- GLAD (Griffiths Learning Ability Determination)
- Adaptive functioning assessment

### SLD (Specific Learning Disabilities)
- Reading and writing assessment
- Math disability screening
- Processing speed evaluation

## Contributing

See main NeuroSync repository for contributing guidelines.
