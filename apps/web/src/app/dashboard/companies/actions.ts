"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"

export type DreamCompanyStatus = 'active' | 'role_found' | 'applied' | 'waiting' | 'paused' | 'removed'

export async function getDreamCompanies() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Unauthorized")
  }

  const { data, error } = await supabase
    .from('dream_companies')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error("Error fetching dream companies:", error)
    throw new Error(error.message)
  }

  return data
}

export async function addDreamCompany(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Unauthorized")
  }

  const companyName = formData.get("company_name") as string
  const companyDomain = formData.get("company_domain") as string
  const industry = formData.get("industry") as string
  const linkedinUrl = formData.get("company_linkedin_url") as string
  const description = formData.get("company_description") as string

  if (!companyName) {
    throw new Error("Company name is required")
  }

  const payload: any = {
    user_id: user.id,
    company_name: companyName,
  }
  if (companyDomain) payload.company_domain = companyDomain
  if (industry) payload.industry = industry
  if (linkedinUrl) payload.company_linkedin_url = linkedinUrl
  if (description) payload.company_description = description

  const { data, error } = await supabase
    .from('dream_companies')
    .insert([payload])
    .select()
    .single()

  if (error) {
    console.error("Error adding dream company:", error)
    throw new Error(error.message)
  }

  revalidatePath('/dashboard/companies')
  return { success: true, data }
}

export async function updateDreamCompanyStatus(id: string, status: DreamCompanyStatus) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Unauthorized")
  }

  const { error } = await supabase
    .from('dream_companies')
    .update({ status })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    console.error("Error updating dream company status:", error)
    throw new Error(error.message)
  }

  revalidatePath('/dashboard/companies')
  return { success: true }
}

export async function removeDreamCompany(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Unauthorized")
  }

  const { error } = await supabase
    .from('dream_companies')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    console.error("Error removing dream company:", error)
    throw new Error(error.message)
  }

  revalidatePath('/dashboard/companies')
  return { success: true }
}
