import { z } from 'zod';

export const VehicleTypeEnum = z.enum(['van', 'truck', 'car']);
export type VehicleType = z.infer<typeof VehicleTypeEnum>;

export interface Driver {
    id: string;
    name: string;
    phone: string | null;
    home_postcode: string | null;
    home_lat: number | null;
    home_lng: number | null;
    vehicle_type: VehicleType;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export const CreateDriverSchema = z.object({
    name: z.string().min(1, 'name is required').max(100),
    phone: z.string().max(30).optional(),
    home_postcode: z.string().max(10).optional(),
    vehicle_type: VehicleTypeEnum.optional(),
});
export type CreateDriverInput = z.infer<typeof CreateDriverSchema>;

export const UpdateDriverSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    phone: z.string().max(30).nullable().optional(),
    home_postcode: z.string().max(10).nullable().optional(),
    vehicle_type: VehicleTypeEnum.optional(),
});
export type UpdateDriverInput = z.infer<typeof UpdateDriverSchema>;
