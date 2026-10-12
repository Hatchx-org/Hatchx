"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { parseCsv } from "@/lib/csv";
import { parseOptionalDateOnly } from "@/lib/input-validation";
import { createServerClient } from "@/lib/supabase/server";
import type { ClubCustomColumn } from "@/lib/supabase/types";
import { createHash, randomBytes } from "node:crypto";

const denied = { ok: false, message: "Current Club management access is required." };
const columnTypes = new Set<ClubCustomColumn["type"]>(["text","long_text","number","date","checkbox","email","url","select"]);

function customTableError(error: { code?: string | null; message?: string | null } | null, operation: "create" | "update") {
  if (!error) return `Table could not be ${operation === "create" ? "created" : "updated"}.`;
  if (error.code === "23505") return "This Club already has a table with that name.";
  if (["42P01", "PGRST205"].includes(error.code ?? "")) return "Custom forms are not installed in the database. Apply supabase/schema.sql.";
  if (["42703", "PGRST204"].includes(error.code ?? "")) return "The Custom forms schema is out of date. Reapply supabase/schema.sql, then supabase/schema.sql.";
  if (error.code === "42501") return "Your account can open this Club but cannot save forms. Ask an Admin to verify the Club assignment and Custom forms policies.";
  if (error.code === "23514") return "One or more question types are not supported by the current database schema. Apply supabase/schema.sql and try again.";
  return `Table could not be ${operation === "create" ? "created" : "updated"} (database code ${error.code ?? "unknown"}).`;
}

async function context(clubId: string) {
  const user = await getCurrentUser();
  if (!user || !clubId) return null;
  const db = await createServerClient();
  const access = await db.rpc("can_manage_club_forms", { p_club_id: clubId });
  return access.data ? { user, db } : null;
}

export async function createCustomFormLink(form: FormData) {
  const clubId=String(form.get("club_id")??""); const tableId=String(form.get("table_id")??""); const current=await context(clubId); if(!current)return denied;
  const expiresValue=String(form.get("expires_at")??""); const expiresAt=expiresValue?new Date(expiresValue):null;
  if(!tableId||(expiresAt&&!Number.isFinite(expiresAt.getTime()))||(expiresAt&&expiresAt.getTime()<=Date.now()))return {ok:false,message:"Choose a future expiration time or leave it blank."};
  const table=await tableFor(current,clubId,tableId); if(!table.data)return {ok:false,message:"Form was not found."};
  const token=randomBytes(24).toString("base64url"); const tokenHash=createHash("sha256").update(token).digest("hex");
  const result=await current.db.from("club_custom_form_links").insert({table_id:tableId,token_hash:tokenHash,expires_at:expiresAt?.toISOString()??null,active:true,created_by:current.user.id});
  if(result.error)return {ok:false,message:"Share link could not be created. Apply supabase/schema.sql first."};
  revalidatePath(`/clubs/manage/${clubId}/tables/${tableId}`);
  return {ok:true,message:"Share link created.",url:`/forms/${token}`};
}

export async function revokeCustomFormLink(form: FormData) {
  const clubId=String(form.get("club_id")??""); const tableId=String(form.get("table_id")??""); const current=await context(clubId); if(!current)return denied;
  const id=String(form.get("link_id")??""); if(!id)return {ok:false,message:"Link was not found."};
  const result=await current.db.from("club_custom_form_links").update({active:false}).eq("id",id).eq("table_id",tableId).select("id").maybeSingle();
  if(result.error||!result.data)return {ok:false,message:"Link could not be revoked."};
  revalidatePath(`/clubs/manage/${clubId}/tables/${tableId}`); return {ok:true,message:"Share link revoked."};
}

function tableColumns(form: FormData) {
  const labels = form.getAll("column_label").map(value => String(value).trim());
  const types = form.getAll("column_type").map(value => String(value));
  const keys = form.getAll("column_key").map(value => String(value));
  const optionInputs = form.getAll("column_options").map(value => String(value));
  const required = new Set(form.getAll("column_required").map(String));
  if (labels.length < 1 || labels.length > 30 || types.length !== labels.length || keys.length !== labels.length || optionInputs.length !== labels.length) return null;
  if (labels.some(label => label.length < 1 || label.length > 80) || new Set(labels.map(label => label.toLocaleLowerCase())).size !== labels.length) return null;
  const columns: ClubCustomColumn[] = [];
  for (let index=0; index<labels.length; index++) {
    const type = types[index] as ClubCustomColumn["type"];
    if (!columnTypes.has(type) || !/^column_[1-9][0-9]*$/.test(keys[index])) return null;
    const options = optionInputs[index].split(/[\n,]/).map(value => value.trim()).filter(Boolean);
    if (type === "select" && (!options.length || options.length > 50 || options.some(value => value.length > 100) || new Set(options.map(value => value.toLocaleLowerCase())).size !== options.length)) return null;
    columns.push({ key: keys[index], label: labels[index], type, required: required.has(keys[index]), ...(type === "select" ? { options } : {}) });
  }
  return new Set(columns.map(column => column.key)).size === columns.length ? columns : null;
}

function rowData(columns: ClubCustomColumn[], read: (key: string) => unknown) {
  const data: Record<string, string | number | boolean> = {};
  for (const column of columns) {
    const raw = String(read(column.key) ?? "").trim();
    if (column.type === "checkbox") data[column.key] = ["on","true","yes","1"].includes(raw.toLocaleLowerCase());
    else if (column.type === "number") {
      if (!raw && !column.required) data[column.key] = "";
      else { const value = Number(raw); if (!Number.isFinite(value)) return { error: `${column.label} must be a valid number.` }; data[column.key] = value; }
    } else if (column.type === "date") {
      const value = parseOptionalDateOnly(raw); if (value === undefined || (column.required && !value)) return { error: `${column.label} must be a valid date.` }; data[column.key] = value ?? "";
    } else {
      if (column.type === "email" && raw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return { error: `${column.label} must be a valid email.` };
      if (column.type === "url" && raw && (!URL.canParse(raw) || new URL(raw).protocol !== "https:")) return { error: `${column.label} must be a valid HTTPS URL.` };
      if (column.type === "select" && raw && !column.options?.includes(raw)) return { error: `${column.label} has an invalid option.` };
      data[column.key] = raw;
    }
    if (column.required && column.type !== "checkbox" && data[column.key] === "") return { error: `${column.label} is required.` };
    if (typeof data[column.key] === "string" && String(data[column.key]).length > 2000) return { error: `${column.label} is too long.` };
  }
  return { data };
}

export async function createCustomTable(form: FormData) {
  const clubId = String(form.get("club_id") ?? ""); const current = await context(clubId); if (!current) return denied;
  const name = String(form.get("name") ?? "").trim(); const description = String(form.get("description") ?? "").trim(); const columns = tableColumns(form);
  if (name.length < 2 || name.length > 80 || description.length > 500 || !columns) return { ok: false, message: "Check the table name and column settings. Select fields need unique options." };
  const row = await current.db.from("club_custom_tables").insert({ club_id: clubId, name, description: description || null, columns, created_by: current.user.id }).select("id").maybeSingle();
  if (row.error || !row.data) return { ok: false, message: customTableError(row.error, "create") };
  revalidatePath(`/clubs/manage/${clubId}/tables`); return { ok: true, message: "Custom table created." };
}

export async function updateCustomTable(form: FormData) {
  const clubId=String(form.get("club_id")??""); const tableId=String(form.get("table_id")??""); const current=await context(clubId); if(!current)return denied;
  const name=String(form.get("name")??"").trim(); const description=String(form.get("description")??"").trim(); const columns=tableColumns(form);
  if(!tableId||name.length<2||name.length>80||description.length>500||!columns)return {ok:false,message:"Check the table and column settings."};
  const result=await current.db.from("club_custom_tables").update({name,description:description||null,columns}).eq("id",tableId).eq("club_id",clubId).select("id").maybeSingle();
  if(result.error||!result.data)return {ok:false,message:customTableError(result.error,"update")};
  revalidatePath(`/clubs/manage/${clubId}/tables`); revalidatePath(`/clubs/manage/${clubId}/tables/${tableId}`); return {ok:true,message:"Table settings updated."};
}

async function tableFor(current: NonNullable<Awaited<ReturnType<typeof context>>>, clubId:string, tableId:string) {
  return current.db.from("club_custom_tables").select("id,columns,name,description").eq("id",tableId).eq("club_id",clubId).maybeSingle();
}

export async function addCustomTableRow(form: FormData) {
  const clubId=String(form.get("club_id")??""); const tableId=String(form.get("table_id")??""); const current=await context(clubId); if(!current)return denied;
  const table=await tableFor(current,clubId,tableId); if(!table.data)return {ok:false,message:"Table was not found."};
  const parsed=rowData(table.data.columns,key=>form.get(key)); if("error" in parsed)return {ok:false,message:parsed.error ?? "Check the row values."};
  const result=await current.db.from("club_custom_table_rows").insert({table_id:tableId,data:parsed.data,created_by:current.user.id});
  if(result.error)return {ok:false,message:"Row could not be saved."}; revalidatePath(`/clubs/manage/${clubId}/tables/${tableId}`); return {ok:true,message:"Row added."};
}

export async function updateCustomTableRow(form: FormData) {
  const clubId=String(form.get("club_id")??""); const tableId=String(form.get("table_id")??""); const rowId=String(form.get("row_id")??""); const current=await context(clubId); if(!current)return denied;
  const table=await tableFor(current,clubId,tableId); if(!table.data)return {ok:false,message:"Table was not found."};
  const parsed=rowData(table.data.columns,key=>form.get(key)); if("error" in parsed)return {ok:false,message:parsed.error ?? "Check the row values."};
  const result=await current.db.from("club_custom_table_rows").update({data:parsed.data,updated_by:current.user.id}).eq("id",rowId).eq("table_id",tableId).select("id").maybeSingle();
  if(result.error||!result.data)return {ok:false,message:"Row could not be updated. Apply supabase/schema.sql first."}; revalidatePath(`/clubs/manage/${clubId}/tables/${tableId}`); return {ok:true,message:"Row updated."};
}

export async function importCustomTableCsv(form: FormData) {
  const clubId=String(form.get("club_id")??""); const tableId=String(form.get("table_id")??""); const current=await context(clubId); if(!current)return denied;
  const file=form.get("csv"); if(!(file instanceof File)||file.size>1_000_000)return {ok:false,message:"Choose a CSV file up to 1 MB."};
  const table=await tableFor(current,clubId,tableId); if(!table.data)return {ok:false,message:"Table was not found."};
  const csv=parseCsv(await file.text()); const headers=csv.shift()?.map(value=>value.trim().toLocaleLowerCase())??[]; if(!csv.length||csv.length>500)return {ok:false,message:"Import between 1 and 500 rows."};
  const positions=new Map(table.data.columns.map(column=>[column.key,headers.findIndex(header=>header===column.label.toLocaleLowerCase()||header===column.key.toLocaleLowerCase())]));
  if([...positions.values()].every(position=>position<0))return {ok:false,message:"No CSV headers match this table's column names."};
  const rows=[];
  for(let index=0;index<csv.length;index++){const parsed=rowData(table.data.columns,key=>{const position=positions.get(key)??-1;return position<0?"":csv[index][position]??""});if("error" in parsed)return {ok:false,message:`Row ${index+2}: ${parsed.error ?? "Check the row values."}`};rows.push({table_id:tableId,data:parsed.data,created_by:current.user.id});}
  const result=await current.db.from("club_custom_table_rows").insert(rows); if(result.error)return {ok:false,message:"Import failed; no rows were added."}; revalidatePath(`/clubs/manage/${clubId}/tables/${tableId}`); return {ok:true,message:`Imported ${rows.length} rows.`};
}

export async function duplicateCustomTable(form: FormData) {
  const clubId=String(form.get("club_id")??""); const tableId=String(form.get("table_id")??""); const current=await context(clubId); if(!current)return denied;
  const table=await tableFor(current,clubId,tableId); if(!table.data)return {ok:false,message:"Table was not found."};
  const name=String(form.get("name")??`${table.data.name} copy`).trim(); if(name.length<2||name.length>80)return {ok:false,message:"Enter a copy name between 2 and 80 characters."};
  const copy=await current.db.from("club_custom_tables").insert({club_id:clubId,name,description:table.data.description,columns:table.data.columns,created_by:current.user.id}).select("id").maybeSingle();
  if(copy.error||!copy.data)return {ok:false,message:copy.error?.code==="23505"?"A table with that name already exists.":"Table could not be duplicated."}; revalidatePath(`/clubs/manage/${clubId}/tables`); return {ok:true,message:"Table structure duplicated."};
}

export async function deleteCustomTableRow(form: FormData) {
  const clubId=String(form.get("club_id")??""); const tableId=String(form.get("table_id")??""); const current=await context(clubId); if(!current)return denied;
  if(form.get("confirm")!=="yes")return {ok:false,message:"Confirm row deletion first."}; const table=await tableFor(current,clubId,tableId); if(!table.data)return {ok:false,message:"Table was not found."};
  const result=await current.db.from("club_custom_table_rows").delete().eq("id",String(form.get("row_id")??"")).eq("table_id",tableId); if(result.error)return {ok:false,message:"Row could not be deleted."}; revalidatePath(`/clubs/manage/${clubId}/tables/${tableId}`); return {ok:true,message:"Row deleted."};
}

export async function deleteCustomTable(form: FormData) {
  const clubId=String(form.get("club_id")??""); const current=await context(clubId); if(!current)return denied;
  if(form.get("confirm")!=="delete")return {ok:false,message:"Confirm permanent deletion first."}; const result=await current.db.from("club_custom_tables").delete().eq("id",String(form.get("table_id")??"")).eq("club_id",clubId); if(result.error)return {ok:false,message:"Table could not be deleted."}; revalidatePath(`/clubs/manage/${clubId}/tables`); return {ok:true,message:"Table and all of its rows were deleted."};
}
