"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { addDreamCompany } from "./actions"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

export function AddCompanyDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    
    const formData = new FormData(e.currentTarget)
    
    try {
      await addDreamCompany(formData)
      toast.success("Watchlist updated successfully!")
      onOpenChange(false)
    } catch (error: any) {
      toast.error(error.message || "Failed to add company")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-[var(--bg-raised)] border border-[var(--border)] text-[var(--text-1)] p-6 rounded-[16px] shadow-2xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-medium tracking-tight">Add Dream Company</DialogTitle>
            <DialogDescription className="text-[13px] text-[var(--text-2)] mt-1.5">
              Track a specific company to monitor roles and outreach targets.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-5 py-4">
            <div className="grid gap-2">
              <Label htmlFor="company_name" className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider">Company Name <span className="text-destructive">*</span></Label>
              <Input 
                id="company_name" 
                name="company_name" 
                placeholder="e.g. Acme Corp" 
                required 
                className="bg-[var(--bg-base)] border-[var(--border)] focus-visible:ring-1 focus-visible:ring-white/20 h-10 px-3 rounded-[8px] text-[14px]"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="company_domain" className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider">Website Domain</Label>
              <Input 
                id="company_domain" 
                name="company_domain" 
                placeholder="e.g. acme.com" 
                className="bg-[var(--bg-base)] border-[var(--border)] focus-visible:ring-1 focus-visible:ring-white/20 h-10 px-3 rounded-[8px] text-[14px]"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="industry" className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider">Industry</Label>
              <Input 
                id="industry" 
                name="industry" 
                placeholder="e.g. Enterprise Software" 
                className="bg-[var(--bg-base)] border-[var(--border)] focus-visible:ring-1 focus-visible:ring-white/20 h-10 px-3 rounded-[8px] text-[14px]"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="company_description" className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider">Notes</Label>
              <Textarea 
                id="company_description" 
                name="company_description" 
                placeholder="Why do you want to work here?"
                className="resize-none bg-[var(--bg-base)] border-[var(--border)] focus-visible:ring-1 focus-visible:ring-white/20 px-3 py-3 rounded-[8px] text-[14px] min-h-[80px]"
              />
            </div>
          </div>
          
          <DialogFooter className="mt-6 sm:justify-between grid grid-cols-2 gap-3 w-full sm:space-x-0">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              className="w-full bg-transparent border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-overlay)] rounded-[8px] h-10"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading}
              className="w-full bg-[var(--accent)] text-[var(--white)] hover:opacity-80 transition-opacity border-0 rounded-[8px] h-10 font-medium"
            >
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add to Watchlist
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
