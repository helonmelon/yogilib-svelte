import { mediaResponse } from '$lib/server/storage';
import { Failure } from '$lib/server/archive';
import type { RequestHandler } from './$types';
export const GET:RequestHandler=async({params,request})=>{try{return await mediaResponse(params.name,request,true);}catch(e){return new Response(e instanceof Failure?e.message:'File unavailable',{status:404});}};
