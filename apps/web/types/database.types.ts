
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "addresses": {
                  Row: {
                    "address_type": string,"area": string,"city": string,"created_at": string,"full_name": string,"house_no": string,"id": string,"is_default": boolean,"landmark": string | null,"phone": string,"pincode": string,"state": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address_type"?: string,"area": string,"city": string,"created_at"?: string,"full_name": string,"house_no": string,"id"?: string,"is_default"?: boolean,"landmark"?: string | null,"phone": string,"pincode": string,"state": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "address_type"?: string,"area"?: string,"city"?: string,"created_at"?: string,"full_name"?: string,"house_no"?: string,"id"?: string,"is_default"?: boolean,"landmark"?: string | null,"phone"?: string,"pincode"?: string,"state"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "addresses_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"changes": NonNullable<Json>,"created_at": string,"id": string,"ip_address": string | null,"model_id": string | null,"model_name": string,"new_values": NonNullable<Json>,"old_values": NonNullable<Json>,"user_agent": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"changes"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"ip_address"?: string | null,"model_id"?: string | null,"model_name": string,"new_values"?: NonNullable<Json>,"old_values"?: NonNullable<Json>,"user_agent"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"changes"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"ip_address"?: string | null,"model_id"?: string | null,"model_name"?: string,"new_values"?: NonNullable<Json>,"old_values"?: NonNullable<Json>,"user_agent"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"book_variants": {
                  Row: {
                    "book_id": string,"created_at": string,"id": string,"is_active": boolean,"price": number,"sku": string,"stock": number,"updated_at": string,"variant_type": string,"variant_value": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"price": number,"sku": string,"stock"?: number,"updated_at"?: string,"variant_type": string,"variant_value": string
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"price"?: number,"sku"?: string,"stock"?: number,"updated_at"?: string,"variant_type"?: string,"variant_value"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "book_variants_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"books": {
                  Row: {
                    "author": string,"category": string,"cover_image": string,"created_at": string,"description": string,"discount": number,"height_cm": number | null,"id": string,"image_url": string,"images": (string)[],"is_active": boolean,"isbn_10": string | null,"isbn_13": string | null,"language": string | null,"length_cm": number | null,"pages": number | null,"price": number,"published_date": string | null,"publisher": string | null,"sku": string | null,"stock": number,"title": string,"updated_at": string,"weight_grams": number | null,"width_cm": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "author": string,"category": string,"cover_image"?: string,"created_at"?: string,"description"?: string,"discount"?: number,"height_cm"?: number | null,"id"?: string,"image_url": string,"images"?: (string)[],"is_active"?: boolean,"isbn_10"?: string | null,"isbn_13"?: string | null,"language"?: string | null,"length_cm"?: number | null,"pages"?: number | null,"price": number,"published_date"?: string | null,"publisher"?: string | null,"sku"?: string | null,"stock"?: number,"title": string,"updated_at"?: string,"weight_grams"?: number | null,"width_cm"?: number | null
                  }
                  Update: {
                    "author"?: string,"category"?: string,"cover_image"?: string,"created_at"?: string,"description"?: string,"discount"?: number,"height_cm"?: number | null,"id"?: string,"image_url"?: string,"images"?: (string)[],"is_active"?: boolean,"isbn_10"?: string | null,"isbn_13"?: string | null,"language"?: string | null,"length_cm"?: number | null,"pages"?: number | null,"price"?: number,"published_date"?: string | null,"publisher"?: string | null,"sku"?: string | null,"stock"?: number,"title"?: string,"updated_at"?: string,"weight_grams"?: number | null,"width_cm"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"cart_items": {
                  Row: {
                    "book_id": string,"cart_id": string,"created_at": string,"id": string,"price": number,"quantity": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"cart_id": string,"created_at"?: string,"id"?: string,"price": number,"quantity": number,"updated_at"?: string
                  }
                  Update: {
                    "book_id"?: string,"cart_id"?: string,"created_at"?: string,"id"?: string,"price"?: number,"quantity"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cart_items_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cart_items_cart_id_fkey"
      columns: ["cart_id"]
isOneToOne: false
      referencedRelation: "carts"
      referencedColumns: ["id"]
    }
                  ]
                },"carts": {
                  Row: {
                    "created_at": string,"id": string,"last_merge_token": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"last_merge_token"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"last_merge_token"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "carts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "created_at": string,"description": string | null,"display_order": number,"id": string,"image_url": string | null,"is_active": boolean,"name": string,"slug": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"display_order"?: number,"id"?: string,"image_url"?: string | null,"is_active"?: boolean,"name": string,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"display_order"?: number,"id"?: string,"image_url"?: string | null,"is_active"?: boolean,"name"?: string,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"cod_collections": {
                  Row: {
                    "collected_amount": number,"collected_at": string,"collection_reference": string | null,"collection_status": string,"collector_id": string,"created_at": string,"expected_amount": number,"id": string,"notes": string | null,"order_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "collected_amount": number,"collected_at"?: string,"collection_reference"?: string | null,"collection_status": string,"collector_id": string,"created_at"?: string,"expected_amount": number,"id"?: string,"notes"?: string | null,"order_id": string
                  }
                  Update: {
                    "collected_amount"?: number,"collected_at"?: string,"collection_reference"?: string | null,"collection_status"?: string,"collector_id"?: string,"created_at"?: string,"expected_amount"?: number,"id"?: string,"notes"?: string | null,"order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cod_collections_collector_id_fkey"
      columns: ["collector_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cod_collections_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"cod_remittances": {
                  Row: {
                    "courier": string,"created_at": string,"difference_amount": number,"expected_amount": number,"id": string,"notes": string | null,"order_id": string | null,"reconciled_at": string | null,"reconciled_by": string | null,"reconciliation_status": string,"remittance_ref": string,"remitted_amount": number,"remitted_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "courier"?: string,"created_at"?: string,"difference_amount"?: number,"expected_amount": number,"id"?: string,"notes"?: string | null,"order_id"?: string | null,"reconciled_at"?: string | null,"reconciled_by"?: string | null,"reconciliation_status"?: string,"remittance_ref": string,"remitted_amount": number,"remitted_at"?: string
                  }
                  Update: {
                    "courier"?: string,"created_at"?: string,"difference_amount"?: number,"expected_amount"?: number,"id"?: string,"notes"?: string | null,"order_id"?: string | null,"reconciled_at"?: string | null,"reconciled_by"?: string | null,"reconciliation_status"?: string,"remittance_ref"?: string,"remitted_amount"?: number,"remitted_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cod_remittances_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cod_remittances_reconciled_by_fkey"
      columns: ["reconciled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"contact_submissions": {
                  Row: {
                    "admin_notes": string | null,"created_at": string,"email": string,"id": string,"ip_address": string | null,"message": string,"name": string,"responded_at": string | null,"status": string,"subject": string,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_notes"?: string | null,"created_at"?: string,"email": string,"id"?: string,"ip_address"?: string | null,"message": string,"name": string,"responded_at"?: string | null,"status"?: string,"subject": string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "admin_notes"?: string | null,"created_at"?: string,"email"?: string,"id"?: string,"ip_address"?: string | null,"message"?: string,"name"?: string,"responded_at"?: string | null,"status"?: string,"subject"?: string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "contact_submissions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"delivery_otps": {
                  Row: {
                    "attempts": number,"created_at": string,"expires_at": string,"id": string,"max_attempts": number,"order_id": string,"otp_hash": string,"status": string,"updated_at": string,"verified_at": string | null,"verified_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"expires_at": string,"id"?: string,"max_attempts"?: number,"order_id": string,"otp_hash": string,"status"?: string,"updated_at"?: string,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"expires_at"?: string,"id"?: string,"max_attempts"?: number,"order_id"?: string,"otp_hash"?: string,"status"?: string,"updated_at"?: string,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "delivery_otps_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "delivery_otps_verified_by_fkey"
      columns: ["verified_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"delivery_verifications": {
                  Row: {
                    "actor_id": string,"actor_role": string,"attempted_at": string,"delivery_otp_id": string | null,"failure_reason": string | null,"id": string,"metadata": NonNullable<Json>,"order_id": string,"outcome": string,"shipment_awb": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"actor_role": string,"attempted_at"?: string,"delivery_otp_id"?: string | null,"failure_reason"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"order_id": string,"outcome": string,"shipment_awb"?: string | null
                  }
                  Update: {
                    "actor_id"?: string,"actor_role"?: string,"attempted_at"?: string,"delivery_otp_id"?: string | null,"failure_reason"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"order_id"?: string,"outcome"?: string,"shipment_awb"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "delivery_verifications_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "delivery_verifications_delivery_otp_id_fkey"
      columns: ["delivery_otp_id"]
isOneToOne: false
      referencedRelation: "delivery_otps"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "delivery_verifications_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"discounts": {
                  Row: {
                    "code": string,"created_at": string,"discount_type": string,"discount_value": number,"id": string,"is_active": boolean,"max_discount_amount": number | null,"min_order_amount": number,"updated_at": string,"usage_limit": number | null,"used_count": number,"valid_from": string,"valid_until": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"discount_type": string,"discount_value": number,"id"?: string,"is_active"?: boolean,"max_discount_amount"?: number | null,"min_order_amount"?: number,"updated_at"?: string,"usage_limit"?: number | null,"used_count"?: number,"valid_from"?: string,"valid_until"?: string | null
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"discount_type"?: string,"discount_value"?: number,"id"?: string,"is_active"?: boolean,"max_discount_amount"?: number | null,"min_order_amount"?: number,"updated_at"?: string,"usage_limit"?: number | null,"used_count"?: number,"valid_from"?: string,"valid_until"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"email_logs": {
                  Row: {
                    "created_at": string,"event_type": string,"id": string,"order_id": string | null,"provider_response": string | null,"recipient": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_type": string,"id"?: string,"order_id"?: string | null,"provider_response"?: string | null,"recipient": string,"status": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"event_type"?: string,"id"?: string,"order_id"?: string | null,"provider_response"?: string | null,"recipient"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_logs_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory_adjustments": {
                  Row: {
                    "adjustment_type": string,"admin_id": string,"book_id": string,"created_at": string,"id": string,"new_stock": number,"previous_stock": number,"quantity_change": number,"reason": string
                  }
                  ComputedFields: never
                  Insert: {
                    "adjustment_type": string,"admin_id": string,"book_id": string,"created_at"?: string,"id"?: string,"new_stock": number,"previous_stock": number,"quantity_change": number,"reason": string
                  }
                  Update: {
                    "adjustment_type"?: string,"admin_id"?: string,"book_id"?: string,"created_at"?: string,"id"?: string,"new_stock"?: number,"previous_stock"?: number,"quantity_change"?: number,"reason"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_adjustments_admin_id_fkey"
      columns: ["admin_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_adjustments_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory_history": {
                  Row: {
                    "actor_id": string | null,"book_id": string,"created_at": string,"id": string,"movement_type": string,"new_stock": number,"previous_stock": number,"quantity_change": number,"reason": string,"related_order_id": string | null,"related_return_id": string | null,"variant_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"book_id": string,"created_at"?: string,"id"?: string,"movement_type": string,"new_stock": number,"previous_stock": number,"quantity_change": number,"reason": string,"related_order_id"?: string | null,"related_return_id"?: string | null,"variant_id"?: string | null
                  }
                  Update: {
                    "actor_id"?: string | null,"book_id"?: string,"created_at"?: string,"id"?: string,"movement_type"?: string,"new_stock"?: number,"previous_stock"?: number,"quantity_change"?: number,"reason"?: string,"related_order_id"?: string | null,"related_return_id"?: string | null,"variant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_history_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_history_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_history_related_order_id_fkey"
      columns: ["related_order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_history_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "book_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory_reservations": {
                  Row: {
                    "book_id": string,"created_at": string,"expires_at": string | null,"id": string,"order_id": string,"payment_method": string,"quantity": number,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"expires_at"?: string | null,"id"?: string,"order_id": string,"payment_method": string,"quantity": number,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"expires_at"?: string | null,"id"?: string,"order_id"?: string,"payment_method"?: string,"quantity"?: number,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_reservations_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_reservations_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"invoices": {
                  Row: {
                    "billing_address": NonNullable<Json>,"billing_name": string,"cgst_amount": number,"cgst_rate": number,"created_at": string,"customer_id": string | null,"discount_amount": number,"grand_total": number,"id": string,"igst_amount": number,"igst_rate": number,"invoice_date": string,"invoice_number": string,"items_snapshot": NonNullable<Json>,"order_id": string,"payment_method": string,"payment_reference": string | null,"payment_status": string,"seller_gstin": string,"sgst_amount": number,"sgst_rate": number,"shipping_address": NonNullable<Json>,"shipping_charges": number,"subtotal": number,"taxable_value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "billing_address": NonNullable<Json>,"billing_name": string,"cgst_amount"?: number,"cgst_rate"?: number,"created_at"?: string,"customer_id"?: string | null,"discount_amount"?: number,"grand_total": number,"id"?: string,"igst_amount"?: number,"igst_rate"?: number,"invoice_date"?: string,"invoice_number": string,"items_snapshot": NonNullable<Json>,"order_id": string,"payment_method": string,"payment_reference"?: string | null,"payment_status": string,"seller_gstin"?: string,"sgst_amount"?: number,"sgst_rate"?: number,"shipping_address": NonNullable<Json>,"shipping_charges"?: number,"subtotal": number,"taxable_value": number
                  }
                  Update: {
                    "billing_address"?: NonNullable<Json>,"billing_name"?: string,"cgst_amount"?: number,"cgst_rate"?: number,"created_at"?: string,"customer_id"?: string | null,"discount_amount"?: number,"grand_total"?: number,"id"?: string,"igst_amount"?: number,"igst_rate"?: number,"invoice_date"?: string,"invoice_number"?: string,"items_snapshot"?: NonNullable<Json>,"order_id"?: string,"payment_method"?: string,"payment_reference"?: string | null,"payment_status"?: string,"seller_gstin"?: string,"sgst_amount"?: number,"sgst_rate"?: number,"shipping_address"?: NonNullable<Json>,"shipping_charges"?: number,"subtotal"?: number,"taxable_value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_order_id_fkey"
      columns: ["order_id"]
isOneToOne: true
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"order_idempotency_keys": {
                  Row: {
                    "created_at": string,"id": string,"idempotency_key": string,"order_id": string | null,"request_fingerprint": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"idempotency_key": string,"order_id"?: string | null,"request_fingerprint": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"idempotency_key"?: string,"order_id"?: string | null,"request_fingerprint"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_idempotency_keys_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_idempotency_keys_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "book_id": string,"created_at": string,"id": string,"image_url": string,"order_id": string,"price": number,"quantity": number,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"id"?: string,"image_url": string,"order_id": string,"price": number,"quantity": number,"title": string
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"id"?: string,"image_url"?: string,"order_id"?: string,"price"?: number,"quantity"?: number,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"order_status_history": {
                  Row: {
                    "created_at": string,"id": string,"note": string,"order_id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"note"?: string,"order_id": string,"status": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"note"?: string,"order_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_status_history_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"order_consents": {
                  Row: {
                    "accepted_at": string,"id": string,"ip_address": string | null,"order_id": string,"privacy_version": string,"returns_policy_version": string,"shipping_policy_version": string,"terms_accepted": boolean,"terms_version": string,"user_agent": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string,"id"?: string,"ip_address"?: string | null,"order_id": string,"privacy_version"?: string,"returns_policy_version"?: string,"shipping_policy_version"?: string,"terms_accepted": boolean,"terms_version"?: string,"user_agent"?: string | null,"user_id": string
                  }
                  Update: {
                    "accepted_at"?: string,"id"?: string,"ip_address"?: string | null,"order_id"?: string,"privacy_version"?: string,"returns_policy_version"?: string,"shipping_policy_version"?: string,"terms_accepted"?: boolean,"terms_version"?: string,"user_agent"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
                      foreignKeyName: "order_consents_order_id_fkey"
                      columns: ["order_id"]
                      isOneToOne: false
                      referencedRelation: "orders"
                      referencedColumns: ["id"]
                    },
                    {
                      foreignKeyName: "order_consents_user_id_fkey"
                      columns: ["user_id"]
                      isOneToOne: false
                      referencedRelation: "profiles"
                      referencedColumns: ["id"]
                    }
                  ]
                },"orders": {
                  Row: {
                    "address_snapshot": NonNullable<Json>,"cancel_reason": string | null,"cod_settled_amount": number | null,"cod_settled_at": string | null,"cod_settlement_ref": string | null,"cod_settlement_status": string,"consent_record": Json | null,"coupon_code": string | null,"coupon_status": string,"created_at": string,"delivered_at": string | null,"delivery_fee": number | null,"discount_amount": number | null,"id": string,"idempotency_key": string | null,"is_paid": boolean,"order_number": string,"order_status": string,"paid_at": string | null,"payment_method": string,"payment_status": string,"platform_fee": number | null,"razorpay_order_id": string | null,"razorpay_payment_id": string | null,"razorpay_refund_id": string | null,"refund_amount": number | null,"refund_status": string | null,"refunded_at": string | null,"replacement_reason": string | null,"replacement_rejected_at": string | null,"replacement_rejection_reason": string | null,"replacement_requested": boolean,"replacement_requested_at": string | null,"replacement_status": string,"request_fingerprint": string | null,"shipping_awb": string | null,"shipping_courier": string,"shipping_delivered_at": string | null,"shipping_label_url": string | null,"shipping_pickup_request_id": string | null,"shipping_pickup_scheduled": boolean,"shipping_pickup_scheduled_at": string | null,"shipping_shipped_at": string | null,"shipping_tracking_url": string | null,"subtotal": number | null,"total_amount": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address_snapshot": NonNullable<Json>,"cancel_reason"?: string | null,"cod_settled_amount"?: number | null,"cod_settled_at"?: string | null,"cod_settlement_ref"?: string | null,"cod_settlement_status"?: string,"consent_record"?: Json | null,"coupon_code"?: string | null,"coupon_status"?: string,"created_at"?: string,"delivered_at"?: string | null,"delivery_fee"?: number | null,"discount_amount"?: number | null,"id"?: string,"idempotency_key"?: string | null,"is_paid"?: boolean,"order_number": string,"order_status"?: string,"paid_at"?: string | null,"payment_method": string,"payment_status"?: string,"platform_fee"?: number | null,"razorpay_order_id"?: string | null,"razorpay_payment_id"?: string | null,"razorpay_refund_id"?: string | null,"refund_amount"?: number | null,"refund_status"?: string | null,"refunded_at"?: string | null,"replacement_reason"?: string | null,"replacement_rejected_at"?: string | null,"replacement_rejection_reason"?: string | null,"replacement_requested"?: boolean,"replacement_requested_at"?: string | null,"replacement_status"?: string,"request_fingerprint"?: string | null,"shipping_awb"?: string | null,"shipping_courier"?: string,"shipping_delivered_at"?: string | null,"shipping_label_url"?: string | null,"shipping_pickup_request_id"?: string | null,"shipping_pickup_scheduled"?: boolean,"shipping_pickup_scheduled_at"?: string | null,"shipping_shipped_at"?: string | null,"shipping_tracking_url"?: string | null,"subtotal"?: number | null,"total_amount": number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "address_snapshot"?: NonNullable<Json>,"cancel_reason"?: string | null,"cod_settled_amount"?: number | null,"cod_settled_at"?: string | null,"cod_settlement_ref"?: string | null,"cod_settlement_status"?: string,"consent_record"?: Json | null,"coupon_code"?: string | null,"coupon_status"?: string,"created_at"?: string,"delivered_at"?: string | null,"delivery_fee"?: number | null,"discount_amount"?: number | null,"id"?: string,"idempotency_key"?: string | null,"is_paid"?: boolean,"order_number"?: string,"order_status"?: string,"paid_at"?: string | null,"payment_method"?: string,"payment_status"?: string,"platform_fee"?: number | null,"razorpay_order_id"?: string | null,"razorpay_payment_id"?: string | null,"razorpay_refund_id"?: string | null,"refund_amount"?: number | null,"refund_status"?: string | null,"refunded_at"?: string | null,"replacement_reason"?: string | null,"replacement_rejected_at"?: string | null,"replacement_rejection_reason"?: string | null,"replacement_requested"?: boolean,"replacement_requested_at"?: string | null,"replacement_status"?: string,"request_fingerprint"?: string | null,"shipping_awb"?: string | null,"shipping_courier"?: string,"shipping_delivered_at"?: string | null,"shipping_label_url"?: string | null,"shipping_pickup_request_id"?: string | null,"shipping_pickup_scheduled"?: boolean,"shipping_pickup_scheduled_at"?: string | null,"shipping_shipped_at"?: string | null,"shipping_tracking_url"?: string | null,"subtotal"?: number | null,"total_amount"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"created_at": string,"currency": string,"id": string,"idempotency_key": string | null,"order_id": string,"payment_id": string,"provider": string,"provider_order_id": string,"provider_payment_id": string | null,"raw_response": Json | null,"refund_amount": number | null,"refund_id": string | null,"refund_status": string | null,"refunded_at": string | null,"signature": string | null,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"currency"?: string,"id"?: string,"idempotency_key"?: string | null,"order_id": string,"payment_id": string,"provider"?: string,"provider_order_id": string,"provider_payment_id"?: string | null,"raw_response"?: Json | null,"refund_amount"?: number | null,"refund_id"?: string | null,"refund_status"?: string | null,"refunded_at"?: string | null,"signature"?: string | null,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"currency"?: string,"id"?: string,"idempotency_key"?: string | null,"order_id"?: string,"payment_id"?: string,"provider"?: string,"provider_order_id"?: string,"provider_payment_id"?: string | null,"raw_response"?: Json | null,"refund_amount"?: number | null,"refund_id"?: string | null,"refund_status"?: string | null,"refunded_at"?: string | null,"signature"?: string | null,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"phone_verifications": {
                  Row: {
                    "attempts": number,"created_at": string,"expires_at": string,"id": string,"is_verified": boolean,"max_attempts": number,"otp_hash": string,"phone": string,"user_id": string,"verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"expires_at": string,"id"?: string,"is_verified"?: boolean,"max_attempts"?: number,"otp_hash": string,"phone": string,"user_id": string,"verified_at"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"expires_at"?: string,"id"?: string,"is_verified"?: boolean,"max_attempts"?: number,"otp_hash"?: string,"phone"?: string,"user_id"?: string,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "phone_verifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"email": string,"id": string,"is_blocked": boolean,"is_deleted": boolean,"name": string,"phone": string | null,"role": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"email": string,"id": string,"is_blocked"?: boolean,"is_deleted"?: boolean,"name": string,"phone"?: string | null,"role"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"email"?: string,"id"?: string,"is_blocked"?: boolean,"is_deleted"?: boolean,"name"?: string,"phone"?: string | null,"role"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rate_limits": {
                  Row: {
                    "count": number,"key": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"key": string,"window_start": string
                  }
                  Update: {
                    "count"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"refund_records": {
                  Row: {
                    "amount": number,"authorized_by": string,"created_at": string,"currency": string,"error_message": string | null,"gateway_refund_id": string | null,"gateway_status": string | null,"id": string,"order_id": string,"reason": string,"return_request_id": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"authorized_by": string,"created_at"?: string,"currency"?: string,"error_message"?: string | null,"gateway_refund_id"?: string | null,"gateway_status"?: string | null,"id"?: string,"order_id": string,"reason": string,"return_request_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"authorized_by"?: string,"created_at"?: string,"currency"?: string,"error_message"?: string | null,"gateway_refund_id"?: string | null,"gateway_status"?: string | null,"id"?: string,"order_id"?: string,"reason"?: string,"return_request_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "refund_records_authorized_by_fkey"
      columns: ["authorized_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refund_records_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refund_records_return_request_id_fkey"
      columns: ["return_request_id"]
isOneToOne: false
      referencedRelation: "return_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"return_request_items": {
                  Row: {
                    "book_id": string,"created_at": string,"id": string,"order_item_id": string,"quantity": number,"reason": string | null,"return_request_id": string,"unit_price": number,"variant_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"id"?: string,"order_item_id": string,"quantity": number,"reason"?: string | null,"return_request_id": string,"unit_price": number,"variant_id"?: string | null
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"id"?: string,"order_item_id"?: string,"quantity"?: number,"reason"?: string | null,"return_request_id"?: string,"unit_price"?: number,"variant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "return_request_items_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "return_request_items_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "return_request_items_return_request_id_fkey"
      columns: ["return_request_id"]
isOneToOne: false
      referencedRelation: "return_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "return_request_items_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "book_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"return_requests": {
                  Row: {
                    "admin_notes": string | null,"created_at": string,"customer_id": string,"description": string | null,"evidence_urls": (string)[],"id": string,"order_id": string,"pickup_address": Json | null,"pickup_awb": string | null,"pickup_status": string | null,"reason": string,"refund_amount": number | null,"rejection_reason": string | null,"replacement_order_id": string | null,"request_type": string,"resolved_at": string | null,"resolved_by": string | null,"return_number": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_notes"?: string | null,"created_at"?: string,"customer_id": string,"description"?: string | null,"evidence_urls"?: (string)[],"id"?: string,"order_id": string,"pickup_address"?: Json | null,"pickup_awb"?: string | null,"pickup_status"?: string | null,"reason": string,"refund_amount"?: number | null,"rejection_reason"?: string | null,"replacement_order_id"?: string | null,"request_type"?: string,"resolved_at"?: string | null,"resolved_by"?: string | null,"return_number": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "admin_notes"?: string | null,"created_at"?: string,"customer_id"?: string,"description"?: string | null,"evidence_urls"?: (string)[],"id"?: string,"order_id"?: string,"pickup_address"?: Json | null,"pickup_awb"?: string | null,"pickup_status"?: string | null,"reason"?: string,"refund_amount"?: number | null,"rejection_reason"?: string | null,"replacement_order_id"?: string | null,"request_type"?: string,"resolved_at"?: string | null,"resolved_by"?: string | null,"return_number"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "return_requests_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "return_requests_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "return_requests_replacement_order_id_fkey"
      columns: ["replacement_order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "return_requests_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reviews": {
                  Row: {
                    "book_id": string,"comment": string,"created_at": string,"id": string,"moderated_at": string | null,"moderated_by": string | null,"rating": number,"status": string,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"comment": string,"created_at"?: string,"id"?: string,"moderated_at"?: string | null,"moderated_by"?: string | null,"rating": number,"status"?: string,"title": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "book_id"?: string,"comment"?: string,"created_at"?: string,"id"?: string,"moderated_at"?: string | null,"moderated_by"?: string | null,"rating"?: number,"status"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_moderated_by_fkey"
      columns: ["moderated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_alerts": {
                  Row: {
                    "book_id": string,"created_at": string,"id": string,"notified_at": string,"resolved_at": string | null,"status": string,"stock_level": number,"threshold": number
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"id"?: string,"notified_at"?: string,"resolved_at"?: string | null,"status"?: string,"stock_level": number,"threshold"?: number
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"id"?: string,"notified_at"?: string,"resolved_at"?: string | null,"status"?: string,"stock_level"?: number,"threshold"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_alerts_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"support_tickets": {
                  Row: {
                    "assigned_to": string | null,"category": string,"created_at": string,"customer_id": string,"description": string,"id": string,"order_id": string | null,"priority": string,"resolution_notes": string | null,"resolved_at": string | null,"status": string,"subject": string,"ticket_number": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_to"?: string | null,"category": string,"created_at"?: string,"customer_id": string,"description": string,"id"?: string,"order_id"?: string | null,"priority"?: string,"resolution_notes"?: string | null,"resolved_at"?: string | null,"status"?: string,"subject": string,"ticket_number": string,"updated_at"?: string
                  }
                  Update: {
                    "assigned_to"?: string | null,"category"?: string,"created_at"?: string,"customer_id"?: string,"description"?: string,"id"?: string,"order_id"?: string | null,"priority"?: string,"resolution_notes"?: string | null,"resolved_at"?: string | null,"status"?: string,"subject"?: string,"ticket_number"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "support_tickets_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_tickets_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_tickets_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"ticket_messages": {
                  Row: {
                    "attachments": (string)[],"created_at": string,"id": string,"is_staff": boolean,"message": string,"sender_id": string,"ticket_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attachments"?: (string)[],"created_at"?: string,"id"?: string,"is_staff"?: boolean,"message": string,"sender_id": string,"ticket_id": string
                  }
                  Update: {
                    "attachments"?: (string)[],"created_at"?: string,"id"?: string,"is_staff"?: boolean,"message"?: string,"sender_id"?: string,"ticket_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ticket_messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_messages_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "support_tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"webhook_events": {
                  Row: {
                    "created_at": string,"event_id": string,"event_type": string,"id": string,"payload": NonNullable<Json>,"provider": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"event_type": string,"id"?: string,"payload"?: NonNullable<Json>,"provider": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"event_type"?: string,"id"?: string,"payload"?: NonNullable<Json>,"provider"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"wishlists": {
                  Row: {
                    "book_id": string,"created_at": string,"id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"id"?: string,"user_id": string
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wishlists_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wishlists_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "adjust_inventory_atomic":
{ Args: { "p_admin_id": string,"p_book_id": string,"p_quantity": number,"p_reason": string,"p_type": string }; Returns: Json
                           },
"admin_update_user_role":
{ Args: { "p_admin_id": string,"p_new_role": string,"p_target_user_id": string }; Returns: boolean
                           },
"anonymize_customer_account":
{ Args: { "p_user_id": string }; Returns: Json
                           },
"calculate_cart_pricing":
{ Args: { "p_coupon_code"?: string,"p_items": Json }; Returns: Json
                           },
"cancel_order_atomic":
{ Args: { "p_cancel_reason": string,"p_is_admin"?: boolean,"p_order_id": string,"p_user_id": string }; Returns: boolean
                           },
"check_rate_limit":
{ Args: { "p_key": string,"p_max_requests": number,"p_window_seconds": number }; Returns: Json
                           },
"create_order_atomic":
{ Args: { "p_address_snapshot": Json,"p_coupon_code"?: string,"p_idempotency_key"?: string,"p_items": Json,"p_payment_method": string,"p_total_amount"?: number,"p_user_id": string }; Returns: string
                           },
"generate_order_invoice_atomic":
{ Args: { "p_order_id": string,"p_seller_gstin"?: string }; Returns: Json
                           },
"get_admin_dashboard_metrics":
{ Args: { "p_date_from"?: string,"p_date_to"?: string }; Returns: Json
                           },
"get_inventory_report":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_payment_report":
{ Args: { "p_end_date": string,"p_start_date": string }; Returns: Json
                           },
"get_sales_report":
{ Args: { "p_end_date": string,"p_start_date": string }; Returns: Json
                           },
"initiate_return_refund_atomic":
{ Args: { "p_admin_id": string,"p_amount": number,"p_order_id": string,"p_reason": string,"p_return_id": string }; Returns: Json
                           },
"is_active_user":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"merge_cart_atomic":
{ Args: { "p_guest_items": Json,"p_merge_token"?: string,"p_user_id": string }; Returns: Json
                           },
"moderate_review_atomic":
{ Args: { "p_admin_id": string,"p_review_id": string,"p_status": string }; Returns: Json
                           },
"prune_expired_rate_limits":
{ Args: { "p_retention_interval"?: string }; Returns: number
                           },
"record_inventory_movement_atomic":
{ Args: { "p_actor_id"?: string,"p_book_id": string,"p_movement_type"?: string,"p_order_id"?: string,"p_quantity_change"?: number,"p_reason"?: string,"p_return_id"?: string,"p_variant_id"?: string }; Returns: Json
                           },
"record_payment_failure_atomic":
{ Args: { "p_raw_response"?: Json,"p_razorpay_order_id": string }; Returns: Json
                           },
"record_order_consent_atomic":
{ Args: { "p_ip_address"?: string | null,"p_order_id": string,"p_privacy_version"?: string,"p_returns_version"?: string,"p_shipping_version"?: string,"p_terms_accepted": boolean,"p_terms_version"?: string,"p_user_agent"?: string | null,"p_user_id": string }; Returns: Json
                           },
"record_refund_atomic":
{ Args: { "p_order_id": string,"p_raw_response"?: Json,"p_refund_amount": number,"p_refund_id": string,"p_refund_status": string }; Returns: Json
                           },
"regenerate_delivery_otp_atomic":
{ Args: { "p_expires_at": string,"p_new_hash": string,"p_order_id": string }; Returns: Json
                           },
"release_expired_reservations_atomic":
{ Args: { "p_limit"?: number }; Returns: Json
                           },
"request_replacement_atomic":
{ Args: { "p_order_id": string,"p_reason": string,"p_user_id": string }; Returns: Json
                           },
"reserve_replacement_inventory_atomic":
{ Args: { "p_admin_id"?: string,"p_book_id": string,"p_order_id"?: string,"p_quantity": number,"p_reason": string }; Returns: Json
                           },
"settle_payment_atomic":
{ Args: { "p_raw_response"?: Json,"p_razorpay_order_id": string,"p_razorpay_payment_id": string,"p_signature"?: string }; Returns: Json
                           },
"show_limit":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"show_trgm":
{ Args: { "": string }; Returns: (string)[]
                           },
"submit_review_atomic":
{ Args: { "p_book_id": string,"p_comment": string,"p_rating": number,"p_title": string,"p_user_id": string }; Returns: Json
                           },
"update_customer_status":
{ Args: { "p_action": string,"p_admin_id": string,"p_customer_id": string }; Returns: Json
                           },
"validate_discount_coupon":
{ Args: { "p_code": string,"p_subtotal": number }; Returns: Json
                           },
"verify_delivery_otp_atomic":
{ Args: { "p_actor_id": string,"p_actor_role": string,"p_awb"?: string,"p_candidate_hash": string,"p_order_id": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
