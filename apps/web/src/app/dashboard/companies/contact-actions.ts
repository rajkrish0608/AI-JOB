"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"

export type ContactOutreachStatus = 'not_contacted' | 'email_sent' | 'email_opened' | 'replied' | 'connected' | 'no_response'
export type ContactRole = 'hr' | 'recruiter' | 'talent_acquisition' | 'hiring_manager' | 'engineering_manager' | 'employee' | 'other'

export async function getCompanyContacts(dreamCompanyId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error("Unauthorized")

  const { data, error } = await supabase
    .from('company_contacts')
    .select('*')
    .eq('dream_company_id', dreamCompanyId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data
}

export async function addCompanyContact(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error("Unauthorized")

  const dreamCompanyId = formData.get("dream_company_id") as string
  const contactName = formData.get("contact_name") as string
  const contactTitle = formData.get("contact_title") as string
  const contactEmail = formData.get("contact_email") as string
  const contactLinkedinUrl = formData.get("contact_linkedin_url") as string
  const contactRole = formData.get("contact_role") as ContactRole
  const companyName = formData.get("company_name") as string
  const companyDomain = formData.get("company_domain") as string

  if (!contactName) throw new Error("Contact name is required")
  if (!dreamCompanyId) throw new Error("Company ID is required")

  const payload: any = {
    user_id: user.id,
    dream_company_id: dreamCompanyId,
    contact_name: contactName,
    company_name: companyName || null,
    company_domain: companyDomain || null,
  }
  if (contactTitle) payload.contact_title = contactTitle
  if (contactEmail) payload.contact_email = contactEmail
  if (contactLinkedinUrl) payload.contact_linkedin_url = contactLinkedinUrl
  if (contactRole) payload.contact_role = contactRole

  const { data, error } = await supabase
    .from('company_contacts')
    .insert([payload])
    .select()
    .single()

  if (error) throw new Error(error.message)

  revalidatePath('/dashboard/companies')
  return { success: true, data }
}

export async function updateContactOutreachStatus(id: string, status: ContactOutreachStatus) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error("Unauthorized")

  const { error } = await supabase
    .from('company_contacts')
    .update({ outreach_status: status, last_contacted_at: status === 'email_sent' ? new Date().toISOString() : undefined })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)

  revalidatePath('/dashboard/companies')
  return { success: true }
}

export async function removeContact(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error("Unauthorized")

  const { error } = await supabase
    .from('company_contacts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)

  revalidatePath('/dashboard/companies')
  return { success: true }
}

export async function discoverContacts(
  companyId: string,
  companyName: string,
  companyDomain: string | null
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error("Unauthorized")

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  const res = await fetch(`${API_BASE}/api/companies/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: user.id,
      company_id: companyId,
      company_name: companyName,
      company_domain: companyDomain,
      max_results: 10,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Discovery failed: ${err}`)
  }

  const data = await res.json()

  revalidatePath('/dashboard/companies')
  return {
    discovered: data.discovered as number,
    inserted: data.inserted as number,
    contacts: data.contacts as any[],
  }
}
