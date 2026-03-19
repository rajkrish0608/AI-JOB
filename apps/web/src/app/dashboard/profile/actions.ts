"use server"

import { createClient } from "@/utils/supabase/server"

export async function saveProfile(userId: string, data: any) {
  const supabase = await createClient()

  const { error } = await supabase
    .from("user_profiles")
    .upsert({ 
      user_id: userId,
      ...data,
      updated_at: new Date().toISOString()
    })

  if (error) {
    console.error("Error saving profile:", error)
    return { success: false, error: error.message }
  }

  // Update user onboarding status
  await supabase
    .from("users")
    .update({ 
      is_onboarded: true,
      onboarding_step: 7 
    })
    .eq("id", userId)

  return { success: true }
}
