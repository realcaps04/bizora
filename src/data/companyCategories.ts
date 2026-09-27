export interface CompanyCategory {
  id: string
  name: string
  description: string
}

/** Business types used when adding a product and when a company registers. */
export const COMPANY_CATEGORIES: CompanyCategory[] = [
  {
    id: 'supermarkets',
    name: 'Supermarkets and Grocery Stores',
    description: 'General food and household item retailers, ranging from local marts to massive hypermarkets.',
  },
  {
    id: 'pharmacies',
    name: 'Pharmacies and Medical Stores',
    description: 'Dispensaries for prescription medications, over-the-counter health products, and surgical supplies.',
  },
  {
    id: 'apparel',
    name: 'Apparel and Clothing Boutiques',
    description: 'Retailers specializing in fashion, footwear, and accessories.',
  },
  {
    id: 'specialty-manufacturing',
    name: 'Specialty Manufacturing',
    description: 'Factories producing specific physical goods, such as fibre door manufacturers, custom glass blowers, or specialized metal fabricators.',
  },
  {
    id: 'heavy-manufacturing',
    name: 'Heavy Manufacturing',
    description: 'Industrial companies producing large-scale goods like automotive parts, heavy machinery, and construction materials.',
  },
  {
    id: 'restaurants',
    name: 'Restaurants and Food Service',
    description: 'Dine-in eateries, fast-food chains, and quick-service outlets.',
  },
  {
    id: 'cafes',
    name: 'Cafes and Bakeries',
    description: 'Specialty food businesses focusing on coffee, pastries, breads, and light meals.',
  },
  {
    id: 'software',
    name: 'Software Development (IT)',
    description: 'Agencies building custom software, mobile applications, and enterprise systems.',
  },
  {
    id: 'it-support',
    name: 'IT Support and Cybersecurity',
    description: 'Managed service providers handling network security, hardware troubleshooting, and data protection.',
  },
  {
    id: 'ecommerce',
    name: 'E-Commerce and Online Retail',
    description: 'Digital-only storefronts, dropshipping businesses, and online marketplaces.',
  },
  {
    id: 'auto-repair',
    name: 'Automotive Repair and Maintenance',
    description: 'Mechanic garages, auto body repair shops, and tire replacement centers.',
  },
  {
    id: 'auto-dealers',
    name: 'Automotive Dealerships',
    description: 'Showrooms selling new and used cars, motorcycles, and recreational vehicles.',
  },
  {
    id: 'construction',
    name: 'Construction and General Contracting',
    description: 'Companies managing commercial and residential building projects.',
  },
  {
    id: 'skilled-trades',
    name: 'Skilled Trades (Plumbing/Electrical)',
    description: 'Independent contractors providing specific property maintenance and installation services.',
  },
  {
    id: 'architecture',
    name: 'Architecture and Interior Design',
    description: 'Firms designing building layouts, aesthetics, and structural plans.',
  },
  {
    id: 'real-estate',
    name: 'Real Estate Brokerages',
    description: 'Agencies facilitating the buying, selling, and leasing of residential and commercial properties.',
  },
  {
    id: 'property-management',
    name: 'Property Management',
    description: 'Companies overseeing the daily operations, maintenance, and tenant relations for real estate owners.',
  },
  {
    id: 'freight',
    name: 'Freight and Logistics',
    description: 'Freight forwarders and long-haul trucking companies moving bulk goods globally.',
  },
  {
    id: 'courier',
    name: 'Courier and Last-Mile Delivery',
    description: 'Services handling the final leg of shipping to deliver packages directly to consumer doorsteps.',
  },
  {
    id: 'warehousing',
    name: 'Warehousing and Storage',
    description: 'Facilities offering bulk inventory storage, order fulfillment, or personal self-storage units.',
  },
  {
    id: 'accounting',
    name: 'Accounting and Tax Consultancies',
    description: 'Firms providing bookkeeping, corporate audits, and tax preparation services.',
  },
  {
    id: 'financial-advisory',
    name: 'Financial Advisory and Wealth Management',
    description: 'Brokerages and consultants helping clients manage investments and retirement funds.',
  },
  {
    id: 'insurance',
    name: 'Insurance Agencies',
    description: 'Brokers selling health, auto, life, and commercial liability insurance policies.',
  },
]
