export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          address_type: string
          area: string
          city: string
          created_at: string
          full_name: string
          house_no: string
          id: string
          is_default: boolean
          landmark: string | null
          phone: string
          pincode: string
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address_type?: string
          area: string
          city: string
          created_at?: string
          full_name: string
          house_no: string
          id?: string
          is_default?: boolean
          landmark?: string | null
          phone: string
          pincode: string
          state: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address_type?: string
          area?: string
          city?: string
          created_at?: string
          full_name?: string
          house_no?: string
          id?: string
          is_default?: boolean
          landmark?: string | null
          phone?: string
          pincode?: string
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changes: Json
          created_at: string
          id: string
          ip_address: string | null
          model_id: string | null
          model_name: string
          new_values: Json
          old_values: Json
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json
          created_at?: string
          id?: string
          ip_address?: string | null
          model_id?: string | null
          model_name: string
          new_values?: Json
          old_values?: Json
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json
          created_at?: string
          id?: string
          ip_address?: string | null
          model_id?: string | null
          model_name?: string
          new_values?: Json
          old_values?: Json
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          author: string
          category: string
          cover_image: string
          created_at: string
          description: string
          discount: number
          id: string
          image_url: string
          images: string[]
          is_active: boolean
          language: string | null
          pages: number | null
          price: number
          published_date: string | null
          publisher: string | null
          stock: number
          title: string
          updated_at: string
        }
        Insert: {
          author: string
          category: string
          cover_image?: string
          created_at?: string
          description?: string
          discount?: number
          id?: string
          image_url: string
          images?: string[]
          is_active?: boolean
          language?: string | null
          pages?: number | null
          price: number
          published_date?: string | null
          publisher?: string | null
          stock?: number
          title: string
          updated_at?: string
        }
        Update: {
          author?: string
          category?: string
          cover_image?: string
          created_at?: string
          description?: string
          discount?: number
          id?: string
          image_url?: string
          images?: string[]
          is_active?: boolean
          language?: string | null
          pages?: number | null
          price?: number
          published_date?: string | null
          publisher?: string | null
          stock?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          book_id: string
          cart_id: string
          created_at: string
          id: string
          price: number
          quantity: number
          updated_at: string
        }
        Insert: {
          book_id: string
          cart_id: string
          created_at?: string
          id?: string
          price: number
          quantity: number
          updated_at?: string
        }
        Update: {
          book_id?: string
          cart_id?: string
          created_at?: string
          id?: string
          price?: number
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          created_at: string
          event_type: string
          id: string
          order_id: string | null
          provider_response: string | null
          recipient: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          order_id?: string | null
          provider_response?: string | null
          recipient: string
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          order_id?: string | null
          provider_response?: string | null
          recipient?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          book_id: string
          created_at: string
          id: string
          image_url: string
          order_id: string
          price: number
          quantity: number
          title: string
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          image_url: string
          order_id: string
          price: number
          quantity: number
          title: string
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          image_url?: string
          order_id?: string
          price?: number
          quantity?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          created_at: string
          id: string
          note: string
          order_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string
          order_id: string
          status: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_snapshot: Json
          cancel_reason: string | null
          created_at: string
          delivered_at: string | null
          id: string
          is_paid: boolean
          order_status: string
          paid_at: string | null
          payment_method: string
          payment_status: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_refund_id: string | null
          refund_amount: number | null
          refund_status: string | null
          refunded_at: string | null
          replacement_reason: string | null
          replacement_rejected_at: string | null
          replacement_rejection_reason: string | null
          replacement_requested: boolean
          replacement_requested_at: string | null
          replacement_status: string
          shipping_awb: string | null
          shipping_courier: string
          shipping_delivered_at: string | null
          shipping_pickup_scheduled: boolean
          shipping_shipped_at: string | null
          shipping_tracking_url: string | null
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          address_snapshot: Json
          cancel_reason?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          is_paid?: boolean
          order_status?: string
          paid_at?: string | null
          payment_method: string
          payment_status?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_refund_id?: string | null
          refund_amount?: number | null
          refund_status?: string | null
          refunded_at?: string | null
          replacement_reason?: string | null
          replacement_rejected_at?: string | null
          replacement_rejection_reason?: string | null
          replacement_requested?: boolean
          replacement_requested_at?: string | null
          replacement_status?: string
          shipping_awb?: string | null
          shipping_courier?: string
          shipping_delivered_at?: string | null
          shipping_pickup_scheduled?: boolean
          shipping_shipped_at?: string | null
          shipping_tracking_url?: string | null
          total_amount: number
          updated_at?: string
          user_id: string
        }
        Update: {
          address_snapshot?: Json
          cancel_reason?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          is_paid?: boolean
          order_status?: string
          paid_at?: string | null
          payment_method?: string
          payment_status?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_refund_id?: string | null
          refund_amount?: number | null
          refund_status?: string | null
          refunded_at?: string | null
          replacement_reason?: string | null
          replacement_rejected_at?: string | null
          replacement_rejection_reason?: string | null
          replacement_requested?: boolean
          replacement_requested_at?: string | null
          replacement_status?: string
          shipping_awb?: string | null
          shipping_courier?: string
          shipping_delivered_at?: string | null
          shipping_pickup_scheduled?: boolean
          shipping_shipped_at?: string | null
          shipping_tracking_url?: string | null
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          idempotency_key: string | null
          order_id: string
          payment_id: string
          provider: string
          provider_order_id: string
          provider_payment_id: string | null
          raw_response: Json | null
          refund_id: string | null
          refund_amount: number | null
          refund_status: string | null
          refunded_at: string | null
          signature: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string | null
          order_id: string
          payment_id: string
          provider?: string
          provider_order_id: string
          provider_payment_id?: string | null
          raw_response?: Json | null
          refund_id?: string | null
          refund_amount?: number | null
          refund_status?: string | null
          refunded_at?: string | null
          signature?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string | null
          order_id?: string
          payment_id?: string
          provider?: string
          provider_order_id?: string
          provider_payment_id?: string | null
          raw_response?: Json | null
          refund_id?: string | null
          refund_amount?: number | null
          refund_status?: string | null
          refunded_at?: string | null
          signature?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string
          id: string
          is_blocked: boolean
          is_deleted: boolean
          name: string
          phone: string | null
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email: string
          id: string
          is_blocked?: boolean
          is_deleted?: boolean
          name: string
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string
          id?: string
          is_blocked?: boolean
          is_deleted?: boolean
          name?: string
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_order_atomic: {
        Args: {
          p_cancel_reason: string
          p_is_admin?: boolean
          p_order_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      create_order_atomic: {
        Args: {
          p_address_snapshot: Json
          p_items: Json
          p_payment_method: string
          p_total_amount: number
          p_user_id: string
        }
        Returns: string
      }
      settle_payment_atomic: {
        Args: {
          p_razorpay_order_id: string
          p_razorpay_payment_id: string
          p_signature: string
          p_raw_response?: Json
        }
        Returns: Json
      }
      record_payment_failure_atomic: {
        Args: {
          p_razorpay_order_id: string
          p_raw_response?: Json
        }
        Returns: Json
      }
      record_refund_atomic: {
        Args: {
          p_order_id: string
          p_refund_id: string
          p_refund_amount: number
          p_refund_status: string
          p_raw_response?: Json
        }
        Returns: Json
      }
      is_active_user: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

