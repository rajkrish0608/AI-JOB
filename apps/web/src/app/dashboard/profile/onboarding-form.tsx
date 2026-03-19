"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useFieldArray } from "react-hook-form"
import * as z from "zod"
import { FileUp, Loader2, CheckCircle2, ChevronRight, ChevronLeft, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { saveProfile } from "./actions"

const STEPS = [
  { id: "resume", title: "Smart Resume Parsing" },
  { id: "personal", title: "Personal Details" },
  { id: "experience", title: "Work Experience" },
  { id: "education", title: "Education" },
  { id: "skills", title: "Skills & Projects" },
  { id: "preferences", title: "Job Preferences" }
]

const profileSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  location_city: z.string().optional(),
  location_state: z.string().optional(),
  location_country: z.string().default("India"),
  phone: z.string().optional(),
  linkedin_url: z.string().url().optional().or(z.literal("")),
  github_url: z.string().url().optional().or(z.literal("")),
  portfolio_url: z.string().url().optional().or(z.literal("")),
  skills: z.array(z.string()).default([]),
  experience: z.array(z.any()).default([]),
  education: z.array(z.any()).default([]),
  projects: z.array(z.any()).default([]),
  preferred_roles: z.array(z.string()).default([]),
  job_type: z.enum(["job", "internship", "both"]).default("job"),
  remote_preference: z.enum(["remote", "onsite", "hybrid", "any"]).default("any"),
  salary_expectation_min: z.coerce.number().optional(),
  platforms_enabled: z.array(z.string()).default(["linkedin", "naukri", "indeed"]),
  uploaded_resume_url: z.string().optional()
})

type ProfileValues = z.infer<typeof profileSchema>

export default function OnboardingForm({ initialData, userId }: { initialData: any, userId: string }) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [isParsing, setIsParsing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: initialData || {
      first_name: "",
      last_name: "",
      location_country: "India",
      skills: [],
      experience: [],
      education: [],
      projects: [],
      preferred_roles: [],
      job_type: "job",
      remote_preference: "any",
      platforms_enabled: ["linkedin", "naukri", "indeed"]
    }
  })

  // Dynamic arrays
  const expArray = useFieldArray({ control: form.control, name: "experience" })
  const edArray = useFieldArray({ control: form.control, name: "education" })
  const projArray = useFieldArray({ control: form.control, name: "projects" })

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF file.")
      return
    }

    setIsParsing(true)
    const formData = new FormData()
    formData.append("file", file)

    try {
      const res = await fetch("http://localhost:8000/api/parse-resume", {
        method: "POST",
        body: formData
      })
      
      const result = await res.json()
      
      if (res.ok && result.data) {
        toast.success("Resume parsed successfully!")
        
        // Auto-fill form fields
        const data = result.data
        if (data.first_name) form.setValue("first_name", data.first_name)
        if (data.last_name) form.setValue("last_name", data.last_name)
        if (data.phone) form.setValue("phone", data.phone)
        if (data.location_city) form.setValue("location_city", data.location_city)
        if (data.location_country) form.setValue("location_country", data.location_country)
        if (data.linkedin_url) form.setValue("linkedin_url", data.linkedin_url)
        if (data.github_url) form.setValue("github_url", data.github_url)
        if (data.skills) form.setValue("skills", data.skills)
        if (data.experience) form.setValue("experience", data.experience)
        if (data.education) form.setValue("education", data.education)
        if (data.projects) form.setValue("projects", data.projects)
        
        // Move to next step automatically
        setCurrentStep(1)
      } else {
        toast.error("Failed to parse resume: " + result.detail)
      }
    } catch (err) {
      console.error(err)
      toast.error("Error communicating with parser service.")
    } finally {
      setIsParsing(false)
    }
  }

  const onSubmit = async (data: ProfileValues) => {
    setIsSaving(true)
    try {
      // Clean up empty arrays parsing
      if (typeof data.skills === "string") {
        data.skills = (data.skills as string).split(",").map(s => s.trim()).filter(Boolean)
      }
      if (typeof data.preferred_roles === "string") {
        data.preferred_roles = (data.preferred_roles as string).split(",").map(s => s.trim()).filter(Boolean)
      }

      const result = await saveProfile(userId, data)
      if (result.success) {
        toast.success("Profile saved successfully")
        router.push("/dashboard")
      } else {
        toast.error("Failed to save: " + result.error)
      }
    } catch (e) {
      toast.error("An error occurred")
    } finally {
      setIsSaving(false)
    }
  }

  const nextStep = async () => {
    // Validate current step before proceeding
    let fieldsToValidate: any[] = []
    if (currentStep === 1) fieldsToValidate = ["first_name", "last_name"]
    
    if (fieldsToValidate.length > 0) {
      const isValid = await form.trigger(fieldsToValidate)
      if (!isValid) return
    }
    
    setCurrentStep(c => Math.min(c + 1, STEPS.length - 1))
  }
  
  const prevStep = () => setCurrentStep(c => Math.max(c - 1, 0))

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm font-medium">
          <span className="text-primary">Step {currentStep + 1} of {STEPS.length}</span>
          <span className="text-muted-foreground">{STEPS[currentStep].title}</span>
        </div>
        <Progress value={((currentStep + 1) / STEPS.length) * 100} className="h-2" />
      </div>

      <Card className="border-border">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardHeader>
            <CardTitle>{STEPS[currentStep].title}</CardTitle>
            <CardDescription>
              {currentStep === 0 && "Upload your existing resume to let AI instantly pre-fill your profile."}
              {currentStep === 1 && "Basic information so recruiters know who you are."}
              {currentStep === 2 && "Detail your past work experience."}
              {currentStep === 5 && "Tell the AI what kind of jobs to apply for."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 min-h-[400px]">
            {/* STEP 0: RESUME UPLOAD */}
            {currentStep === 0 && (
              <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-input rounded-lg bg-muted/30">
                {isParsing ? (
                  <div className="flex flex-col items-center gap-4 text-center">
                    <Loader2 className="h-10 w-10 animate-spin text-secondary" />
                    <h3 className="font-semibold text-lg">AI is reading your resume...</h3>
                    <p className="text-sm text-muted-foreground w-64">
                      Extracting your entire career history into structured data. This usually takes 10-15 seconds.
                    </p>
                  </div>
                ) : (
                  <>
                    <FileUp className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="font-semibold text-lg mb-2">Upload your PDF Resume</h3>
                    <p className="text-sm text-muted-foreground mb-6 text-center w-80">
                      Save 15 minutes by letting Claude 3.5 Sonnet extract your details automatically.
                    </p>
                    <Label htmlFor="resume-upload" className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium">
                      Select PDF File
                    </Label>
                    <Input 
                      id="resume-upload" 
                      type="file" 
                      accept=".pdf" 
                      className="hidden" 
                      onChange={handleFileUpload} 
                    />
                    <div className="mt-8 flex items-center justify-center w-full">
                      <div className="h-px bg-border flex-1" />
                      <span className="text-xs text-muted-foreground px-4 uppercase">OR</span>
                      <div className="h-px bg-border flex-1" />
                    </div>
                    <Button variant="ghost" type="button" className="mt-4" onClick={nextStep}>
                      Skip and fill manually
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* STEP 1: PERSONAL INFO */}
            {currentStep === 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name <span className="text-red-500">*</span></Label>
                  <Input {...form.register("first_name")} />
                  {form.formState.errors.first_name && <p className="text-xs text-red-500">{form.formState.errors.first_name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Last Name <span className="text-red-500">*</span></Label>
                  <Input {...form.register("last_name")} />
                  {form.formState.errors.last_name && <p className="text-xs text-red-500">{form.formState.errors.last_name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input {...form.register("phone")} />
                </div>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input {...form.register("location_city")} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>LinkedIn Profile URL</Label>
                  <Input {...form.register("linkedin_url")} placeholder="https://linkedin.com/in/username" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>GitHub Profile URL</Label>
                  <Input {...form.register("github_url")} placeholder="https://github.com/username" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Personal Portfolio URL</Label>
                  <Input {...form.register("portfolio_url")} placeholder="https://yourwebsite.com" />
                </div>
              </div>
            )}

            {/* STEP 2: EXPERIENCE */}
            {currentStep === 2 && (
              <div className="space-y-6">
                {expArray.fields.map((field, index) => (
                  <div key={field.id} className="p-4 border rounded-md space-y-4 relative bg-muted/10">
                    <Button 
                      type="button" 
                      variant="destructive" 
                      size="sm" 
                      className="absolute top-2 right-2"
                      onClick={() => expArray.remove(index)}
                    >
                      Remove
                    </Button>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Job Title</Label>
                        <Input {...form.register(`experience.${index}.position` as const)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Company</Label>
                        <Input {...form.register(`experience.${index}.company` as const)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Time Period (e.g. Jan 2020 - Present)</Label>
                        <Input {...form.register(`experience.${index}.period` as const)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Location</Label>
                        <Input {...form.register(`experience.${index}.location` as const)} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Responsibilities & Achievements (comma separated)</Label>
                        <Textarea 
                          {...form.register(`experience.${index}.responsibilities` as const)} 
                          placeholder="Led team of 5, Increased retention by 20%, Built CI/CD pipelines"
                          rows={3}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full border-dashed"
                  onClick={() => expArray.append({ position: "", company: "", period: "", location: "", responsibilities: [] })}
                >
                  + Add Experience
                </Button>
              </div>
            )}

            {/* STEP 3: EDUCATION */}
            {currentStep === 3 && (
              <div className="space-y-6">
                {edArray.fields.map((field, index) => (
                  <div key={field.id} className="p-4 border rounded-md space-y-4 relative bg-muted/10">
                    <Button 
                      type="button" 
                      variant="destructive" 
                      size="sm" 
                      className="absolute top-2 right-2"
                      onClick={() => edArray.remove(index)}
                    >
                      Remove
                    </Button>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Degree/Level</Label>
                        <Input {...form.register(`education.${index}.education_level` as const)} placeholder="Bachelor of Technology" />
                      </div>
                      <div className="space-y-2">
                        <Label>Institution</Label>
                        <Input {...form.register(`education.${index}.institution` as const)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Field of Study</Label>
                        <Input {...form.register(`education.${index}.field_of_study` as const)} placeholder="Computer Science" />
                      </div>
                      <div className="space-y-2">
                        <Label>Grade/CGPA</Label>
                        <Input {...form.register(`education.${index}.grade` as const)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Start Year</Label>
                        <Input {...form.register(`education.${index}.year_start` as const)} />
                      </div>
                      <div className="space-y-2">
                        <Label>End Year</Label>
                        <Input {...form.register(`education.${index}.year_end` as const)} />
                      </div>
                    </div>
                  </div>
                ))}
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full border-dashed"
                  onClick={() => edArray.append({ education_level: "", institution: "", field_of_study: "", grade: "", year_start: "", year_end: "" })}
                >
                  + Add Education
                </Button>
              </div>
            )}

            {/* STEP 4: SKILLS & PROJECTS */}
            {currentStep === 4 && (
              <div className="space-y-8">
                <div className="space-y-2">
                  <Label className="text-base">Core Skills</Label>
                  <p className="text-xs text-muted-foreground mb-2">Enter all your skills separated by commas</p>
                  <Textarea 
                    {...form.register("skills")} 
                    placeholder="React, TypeScript, Python, FastAPI, SQL, AWS..." 
                    rows={4}
                  />
                </div>

                <div className="space-y-4">
                  <Label className="text-base block border-b pb-2">Key Projects</Label>
                  {projArray.fields.map((field, index) => (
                    <div key={field.id} className="p-4 border rounded-md space-y-4 relative bg-muted/10">
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        className="absolute top-2 right-2 text-destructive hover:text-destructive"
                        onClick={() => projArray.remove(index)}
                      >
                        Delete
                      </Button>
                      <div className="space-y-2">
                        <Label>Project Name</Label>
                        <Input {...form.register(`projects.${index}.name` as const)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea {...form.register(`projects.${index}.description` as const)} rows={2} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Link URL</Label>
                          <Input {...form.register(`projects.${index}.link` as const)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Tech Stack (comma separated)</Label>
                          <Input {...form.register(`projects.${index}.tech_stack` as const)} />
                        </div>
                      </div>
                    </div>
                  ))}
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full border-dashed"
                    onClick={() => projArray.append({ name: "", description: "", link: "", tech_stack: "" })}
                  >
                    + Add Project
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 5: PREFERENCES */}
            {currentStep === 5 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label>Target Job Titles / Roles (comma separated)</Label>
                  <Input 
                    {...form.register("preferred_roles")} 
                    placeholder="Frontend Engineer, React Developer, Full Stack Developer" 
                  />
                  <p className="text-xs text-muted-foreground">The AI will use these titles to search job boards.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Job Type</Label>
                    <Select onValueChange={(val) => form.setValue("job_type", val as any)} defaultValue={form.getValues("job_type")}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="job">Full Time Job</SelectItem>
                        <SelectItem value="internship">Internship</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Work Arrangement</Label>
                    <Select onValueChange={(val) => form.setValue("remote_preference", val as any)} defaultValue={form.getValues("remote_preference")}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select arrangement" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="remote">Remote Only</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                        <SelectItem value="onsite">On-site</SelectItem>
                        <SelectItem value="any">Any</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Minimum Salary Expectation (Annual, INR)</Label>
                    <Input 
                      type="number" 
                      {...form.register("salary_expectation_min")} 
                      placeholder="e.g. 800000" 
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <Label className="text-base">Job Boards to Auto-Apply On</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {["linkedin", "naukri", "indeed", "glassdoor", "internshala"].map((platform) => (
                      <div key={platform} className="flex items-center space-x-2 border p-3 rounded-md bg-muted/20">
                        <Checkbox 
                          id={`platform-${platform}`} 
                          defaultChecked={form.getValues("platforms_enabled")?.includes(platform)}
                          onCheckedChange={(checked) => {
                            const current = form.getValues("platforms_enabled") || []
                            if (checked) form.setValue("platforms_enabled", [...current, platform])
                            else form.setValue("platforms_enabled", current.filter(p => p !== platform))
                          }}
                        />
                        <Label htmlFor={`platform-${platform}`} className="capitalize cursor-pointer">
                          {platform}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
          
          <CardFooter className="flex justify-between border-t p-6 bg-muted/10">
            <Button 
              type="button" 
              variant="outline" 
              onClick={prevStep}
              disabled={currentStep === 0 || isParsing}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            
            {currentStep < STEPS.length - 1 ? (
              <Button type="button" onClick={nextStep} disabled={isParsing}>
                Next Step
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Complete Profile
              </Button>
            )}
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
