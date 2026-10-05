import type { ReactNode } from 'react'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui'
import { GST_STATES, placeLabel, stateFromGstin } from '@/data/gstStates'
import { INVOICE_TYPES, PAYMENT_TERMS, dueDateFromTerms, type B2bDetails } from '@/data/b2b'
import type { Customer } from '@/types'

export interface GstBusinessOption {
  name: string
  gstin: string
  registrationType: string
  address: string
}

const inputClass =
  'h-9 w-full rounded-md border border-[#D8E4F2] bg-white px-3 text-[13px] text-[#031C45] outline-none placeholder:text-[#94A3B8] focus:border-[#0878F9] focus:ring-2 focus:ring-[#0878F9]/15'

function Box({
  label,
  required,
  error,
  children,
  className,
}: {
  label: string
  required?: boolean
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={className || 'block'}>
      <span className="mb-1.5 block text-[12px] font-medium text-[#62789A]">
        {label}
        {required ? <span className="text-[#DC2626]"> *</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1 block text-[12px] text-[#DC2626]">{error}</span> : null}
    </label>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  error,
  readOnly,
  type = 'text',
}: {
  value: string
  onChange?: (value: string) => void
  placeholder?: string
  error?: string
  readOnly?: boolean
  type?: string
}) {
  return (
    <input
      type={type}
      readOnly={readOnly}
      value={value}
      placeholder={placeholder}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      className={`${inputClass} ${error ? 'border-[#DC2626]' : ''} ${readOnly ? 'bg-[#F8FAFC]' : ''}`}
    />
  )
}

export function B2bSaleForm({
  customerQuery,
  customerOpen,
  customers,
  gstBusinesses,
  onCustomerQuery,
  onCustomerFocus,
  onCustomerBlur,
  onSelectCustomer,
  onSelectGstBusiness,
  onNewCustomer,
  value,
  onChange,
  errors,
  invoiceDate,
}: {
  customerQuery: string
  customerOpen: boolean
  customers: Customer[]
  gstBusinesses: GstBusinessOption[]
  onCustomerQuery: (value: string) => void
  onCustomerFocus: () => void
  onCustomerBlur: () => void
  onSelectCustomer: (customer: Customer) => void
  onSelectGstBusiness: (business: GstBusinessOption) => void
  onNewCustomer: () => void
  value: B2bDetails
  onChange: (patch: Partial<B2bDetails>) => void
  errors: Record<string, string>
  invoiceDate: string
}) {
  function setState(name: string) {
    const state = GST_STATES.find((row) => row.name === name)
    const patch: Partial<B2bDetails> = {
      state: name,
      stateCode: state?.code || '',
    }
    if (!value.placeTouched && state) patch.placeOfSupply = placeLabel(state)
    onChange(patch)
  }

  function setGstin(gstin: string) {
    const upper = gstin.toUpperCase()
    const patch: Partial<B2bDetails> = { gstin: upper }
    const state = stateFromGstin(upper)
    if (state && upper.length >= 2) {
      patch.state = state.name
      patch.stateCode = state.code
      if (!value.placeTouched) patch.placeOfSupply = placeLabel(state)
    }
    onChange(patch)
  }

  function setTerms(terms: string) {
    const due = dueDateFromTerms(invoiceDate, terms)
    onChange({
      paymentTerms: terms,
      dueTouched: false,
      dueDate: due || value.dueDate,
    })
  }

  return (
    <>
      <section className="rounded-[12px] border border-[#D8E4F2] bg-white p-4 shadow-[0_2px_10px_rgba(6,41,92,0.03)]">
        <h2 className="text-[14px] font-semibold text-[#031C45]">Customer / Buyer</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Box label="Customer / Business Name" required error={errors.customer} className="md:col-span-2 xl:col-span-1">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  value={customerQuery}
                  onChange={(e) => onCustomerQuery(e.target.value)}
                  onFocus={onCustomerFocus}
                  onBlur={onCustomerBlur}
                  placeholder="Search business by name, phone or GSTIN"
                  className={`${inputClass} pl-9 ${errors.customer ? 'border-[#DC2626]' : ''}`}
                />
                {customerOpen && (customers.length > 0 || gstBusinesses.length > 0) ? (
                  <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-64 overflow-auto rounded-md border border-[#D8E4F2] bg-white shadow-lg">
                    {gstBusinesses.length > 0 ? (
                      <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#62789A]">
                        GST directory
                      </div>
                    ) : null}
                    {gstBusinesses.map((business) => (
                      <button
                        key={business.gstin}
                        type="button"
                        className="flex w-full flex-col px-3 py-2 text-left hover:bg-[#F5F9FF]"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onSelectGstBusiness(business)}
                      >
                        <span className="text-[13px] font-medium text-[#031C45]">{business.name}</span>
                        <span className="text-[11.5px] text-[#62789A]">
                          {business.gstin} · {business.registrationType}
                        </span>
                      </button>
                    ))}
                    {customers.length > 0 ? (
                      <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#62789A]">
                        Saved customers
                      </div>
                    ) : null}
                    {customers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        className="flex w-full flex-col px-3 py-2 text-left hover:bg-[#F5F9FF]"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onSelectCustomer(customer)}
                      >
                        <span className="text-[13px] font-medium text-[#031C45]">{customer.name}</span>
                        <span className="text-[11.5px] text-[#62789A]">
                          {[customer.phone, customer.gstin].filter(Boolean).join(' · ') || 'No contact details'}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <Button type="button" className="shrink-0" onClick={onNewCustomer}>
                <Plus size={14} /> New
              </Button>
            </div>
          </Box>
          <Box label="GSTIN" required error={errors.gstin}>
            <TextInput value={value.gstin} onChange={setGstin} placeholder="15-character GSTIN" error={errors.gstin} />
          </Box>
          <Box label="Customer Code">
            <TextInput value={value.customerCode} onChange={(customerCode) => onChange({ customerCode })} placeholder="Internal reference" />
          </Box>
          <Box label="Billing Address" required error={errors.billingAddress} className="md:col-span-2">
            <textarea
              value={value.billingAddress}
              onChange={(e) => onChange({ billingAddress: e.target.value })}
              placeholder="Billing address"
              rows={2}
              className={`${inputClass} h-auto py-2 ${errors.billingAddress ? 'border-[#DC2626]' : ''}`}
            />
          </Box>
          <Box label="State" required error={errors.state}>
            <select
              value={value.state}
              onChange={(e) => setState(e.target.value)}
              className={`${inputClass} ${errors.state ? 'border-[#DC2626]' : ''}`}
            >
              <option value="">Select state</option>
              {GST_STATES.map((state) => (
                <option key={state.code} value={state.name}>
                  {state.name}
                </option>
              ))}
            </select>
          </Box>
          <Box label="State Code" required error={errors.stateCode}>
            <TextInput value={value.stateCode} readOnly error={errors.stateCode} placeholder="Auto-filled" />
          </Box>
          <Box label="Place of Supply" required error={errors.placeOfSupply}>
            <select
              value={value.placeOfSupply}
              onChange={(e) => onChange({ placeOfSupply: e.target.value, placeTouched: true })}
              className={`${inputClass} ${errors.placeOfSupply ? 'border-[#DC2626]' : ''}`}
            >
              <option value="">Select place of supply</option>
              {GST_STATES.map((state) => (
                <option key={state.code} value={placeLabel(state)}>
                  {placeLabel(state)}
                </option>
              ))}
            </select>
          </Box>
          <Box label="Contact Person">
            <TextInput value={value.contactPerson} onChange={(contactPerson) => onChange({ contactPerson })} />
          </Box>
          <Box label="Mobile Number">
            <TextInput value={value.mobile} onChange={(mobile) => onChange({ mobile })} />
          </Box>
          <Box label="Email" error={errors.email}>
            <TextInput value={value.email} onChange={(email) => onChange({ email })} error={errors.email} />
          </Box>
          <Box label="PAN" error={errors.pan}>
            <TextInput value={value.pan} onChange={(pan) => onChange({ pan: pan.toUpperCase() })} error={errors.pan} placeholder="Optional" />
          </Box>
          <Box label="Payment Terms">
            <select value={value.paymentTerms} onChange={(e) => setTerms(e.target.value)} className={inputClass}>
              <option value="">Select terms</option>
              {PAYMENT_TERMS.map((term) => (
                <option key={term}>{term}</option>
              ))}
            </select>
          </Box>
          <Box label="Credit Limit (₹)">
            <TextInput value={value.creditLimit} onChange={(creditLimit) => onChange({ creditLimit })} placeholder="Optional" />
          </Box>
          <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-[#031C45]">
            <input
              type="checkbox"
              checked={value.shipDifferent}
              onChange={(e) => onChange({ shipDifferent: e.target.checked })}
            />
            Shipping address is different
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-[#031C45]">
            <input
              type="checkbox"
              checked={value.reverseCharge}
              onChange={(e) => onChange({ reverseCharge: e.target.checked })}
            />
            Reverse charge
          </label>
          {value.shipDifferent ? (
            <Box label="Shipping Address" required error={errors.shippingAddress} className="md:col-span-2 xl:col-span-3">
              <textarea
                value={value.shippingAddress}
                onChange={(e) => onChange({ shippingAddress: e.target.value })}
                rows={2}
                className={`${inputClass} h-auto py-2 ${errors.shippingAddress ? 'border-[#DC2626]' : ''}`}
              />
            </Box>
          ) : null}
        </div>
      </section>

      <section className="rounded-[12px] border border-[#D8E4F2] bg-white p-4 shadow-[0_2px_10px_rgba(6,41,92,0.03)]">
        <h2 className="text-[14px] font-semibold text-[#031C45]">Invoice Details</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Box label="Invoice Type" required error={errors.invoiceType}>
            <select
              value={value.invoiceType}
              onChange={(e) => onChange({ invoiceType: e.target.value })}
              className={`${inputClass} ${errors.invoiceType ? 'border-[#DC2626]' : ''}`}
            >
              {INVOICE_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </Box>
          <Box label="Due Date">
            <TextInput
              type="date"
              value={value.dueDate}
              onChange={(dueDate) => onChange({ dueDate, dueTouched: true })}
            />
          </Box>
          <Box label="PO Number">
            <TextInput value={value.poNumber} onChange={(poNumber) => onChange({ poNumber })} />
          </Box>
          <Box label="PO Date">
            <TextInput type="date" value={value.poDate} onChange={(poDate) => onChange({ poDate })} />
          </Box>
          <Box label="Delivery Challan No.">
            <TextInput value={value.deliveryChallan} onChange={(deliveryChallan) => onChange({ deliveryChallan })} />
          </Box>
          <Box label="Transporter">
            <TextInput value={value.transporter} onChange={(transporter) => onChange({ transporter })} />
          </Box>
          <Box label="Vehicle Number">
            <TextInput value={value.vehicleNumber} onChange={(vehicleNumber) => onChange({ vehicleNumber })} />
          </Box>
          <Box label="E-Way Bill Number">
            <TextInput value={value.ewayBill} onChange={(ewayBill) => onChange({ ewayBill })} />
          </Box>
          <Box label="Reference Number">
            <TextInput value={value.referenceNumber} onChange={(referenceNumber) => onChange({ referenceNumber })} />
          </Box>
          <Box label="Notes" className="md:col-span-2 xl:col-span-3">
            <textarea
              value={value.notes}
              onChange={(e) => onChange({ notes: e.target.value })}
              rows={2}
              placeholder="Optional note for this invoice"
              className={`${inputClass} h-auto py-2`}
            />
          </Box>
        </div>
      </section>
    </>
  )
}
