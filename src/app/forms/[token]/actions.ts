"use server";

import { createServerClient } from "@/lib/supabase/server";
import type { ClubCustomColumn } from "@/lib/supabase/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseOptionalDateOnly } from "@/lib/input-validation";

type PublicForm = { id: string; name: string; description: string | null; club_name: string; columns: ClubCustomColumn[] };

function isPublicForm(value: unknown): value is PublicForm {
  if (!value || typeof value !== "object") return false;
  const form=value as Partial<PublicForm>;
  return typeof form.id==="string"&&typeof form.name==="string"&&Array.isArray(form.columns);
}

export async function submitPublicForm(formData: FormData) {
  if(String(formData.get("website")??""))return {ok:true,message:"Response submitted."};
  if(!isSupabaseConfigured())return {ok:false,message:"Forms are temporarily unavailable."};
  const token=String(formData.get("token")??""); if(!/^[A-Za-z0-9_-]{32}$/.test(token))return {ok:false,message:"This form link is invalid."};
  const db=await createServerClient();
  const limit=await checkRateLimit(db,"public_form_submit");
  if(!limit.allowed)return {ok:false,message:limit.unavailable?"Forms are temporarily unavailable.":"Too many responses were submitted. Wait before trying again."};
  const result=await db.rpc("get_public_custom_form",{p_token:token});
  if(result.error||!isPublicForm(result.data))return {ok:false,message:"This form link is invalid, expired, or has been revoked."};
  const data:Record<string,string|number|boolean>={};
  for(const column of result.data.columns){
    const raw=String(formData.get(column.key)??"").trim();
    if(raw.length>2000)return {ok:false,message:`${column.label} is too long.`};
    if(column.type==="checkbox")data[column.key]=formData.get(column.key)==="on";
    else if(column.type==="number"){
      if(!raw&&!column.required)data[column.key]="";
      else{const value=Number(raw);if(!Number.isFinite(value))return {ok:false,message:`${column.label} must be a valid number.`};data[column.key]=value;}
    }else{
      if(column.required&&!raw)return {ok:false,message:`${column.label} is required.`};
      if(column.type==="date"&&parseOptionalDateOnly(raw)===undefined)return {ok:false,message:`${column.label} must be a valid date.`};
      if(column.type==="email"&&raw&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw))return {ok:false,message:`${column.label} must be a valid email.`};
      if(column.type==="url"&&raw&&(!URL.canParse(raw)||new URL(raw).protocol!=="https:"))return {ok:false,message:`${column.label} must be a valid HTTPS URL.`};
      if(column.type==="select"&&raw&&!column.options?.includes(raw))return {ok:false,message:`${column.label} has an invalid option.`};
      data[column.key]=raw;
    }
  }
  const submitted=await db.rpc("submit_public_custom_form",{p_token:token,p_data:data});
  return submitted.error?{ok:false,message:"Response could not be submitted. Check the fields or ask the Club board or Advisor for a new link."}:{ok:true,message:"Response submitted. Thank you."};
}
