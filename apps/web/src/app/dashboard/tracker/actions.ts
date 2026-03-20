"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"

export type ApplicationStatus = 'saved' | 'applied' | 'reviewing' | 'interviewing' | 'offer' | 'rejected' | 'withdrawn' | 'failed'

export async function getApplications() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error("Unauthorized")

  // Fetch applications and join with job_listings to get company/title/logo info
  const { data, error } = await supabase
    .from('applications')
    .select(`
      *,
      job:job_id (
        id,
        title,
        company,
        company_logo_url,
        location,
        work_style,
        job_type,
        salary_min,
        salary_max,
        salary_currency
      )
    `)
    .eq('user_id', user.id)
    .order('applied_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data
}

export async function updateApplicationStatus(id: string, status: ApplicationStatus) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error("Unauthorized")

  const { data, error } = await supabase
    .from('applications')
    .update({ 
      status, 
      status_updated_at: new Date().toISOString() 
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) throw new Error(error.message)

  revalidatePath('/dashboard/tracker')
  return data
}

export async function deleteApplication(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error("Unauthorized")

  const { error } = await supabase
    .from('applications')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)

  revalidatePath('/dashboard/tracker')
  return { success: true }
}
