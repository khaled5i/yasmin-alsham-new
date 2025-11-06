'use client'

import { useState, useEffect } from 'react'

// نوع البيانات للترجمات
type TranslationKey = string
type TranslationValue = string | { [key: string]: string }
type Translations = { [key: string]: TranslationValue }

// الترجمات العربية
const arTranslations: Translations = {
  // التنقل والعناوين الرئيسية
  'dashboard': 'لوحة التحكم',
  'orders': 'الطلبات',
  'appointments': 'المواعيد',
  'settings': 'الإعدادات',
  'workers': 'العمال',
  'reports': 'التقارير',
  'logout': 'تسجيل الخروج',
  'welcome': 'مرحباً',
  'welcome_back': 'مرحباً بعودتك',
  
  // الأزرار والإجراءات
  'add_new_order': 'إضافة طلب جديد',
  'book_appointment': 'حجز موعد',
  'view_details': 'عرض التفاصيل',
  'edit': 'تعديل',
  'delete': 'حذف',
  'save': 'حفظ',
  'cancel': 'إلغاء',
  'submit': 'إرسال',
  'search': 'بحث',
  'filter': 'تصفية',
  'export': 'تصدير',
  'print': 'طباعة',
  'back': 'رجوع',
  'next': 'التالي',
  'previous': 'السابق',
  'close': 'إغلاق',
  'confirm': 'تأكيد',
  'loading': 'جاري التحميل...',
  'saving': 'جاري الحفظ...',
  
  // حالات الطلبات
  'pending': 'في الانتظار',
  'in_progress': 'قيد التنفيذ',
  'completed': 'مكتمل',
  'delivered': 'تم التسليم',
  'cancelled': 'ملغي',
  
  // نصوص عامة
  'name': 'الاسم',
  'email': 'البريد الإلكتروني',
  'phone': 'رقم الهاتف',
  'address': 'العنوان',
  'date': 'التاريخ',
  'time': 'الوقت',
  'status': 'الحالة',
  'price': 'السعر',
  'total': 'المجموع',
  'description': 'الوصف',
  'notes': 'ملاحظات',
  'client_name': 'اسم الزبونة',
  'client_phone': 'رقم هاتف الزبونة',
  
  // رسائل النجاح والخطأ
  'success': 'نجح',
  'error': 'خطأ',
  'warning': 'تحذير',
  'info': 'معلومات',
  'order_added_success': 'تم إضافة الطلب بنجاح',
  'order_updated_success': 'تم تحديث الطلب بنجاح',
  'order_deleted_success': 'تم حذف الطلب بنجاح',
  'fill_required_fields': 'يرجى ملء جميع الحقول المطلوبة',

  // نصوص إضافية مطلوبة
  'admin_dashboard': 'لوحة تحكم المدير',
  'worker_dashboard': 'لوحة تحكم العامل',
  'admin': 'مدير',
  'worker': 'عامل',
  'change_language': 'تغيير اللغة',
  'my_active_orders': 'طلباتي النشطة',
  'completed_orders': 'الطلبات المكتملة',
  'total_orders': 'إجمالي الطلبات',
  'total_revenue': 'إجمالي الإيرادات',
  'recent_orders': 'الطلبات الحديثة',
  'quick_actions': 'إجراءات سريعة',
  'view_all_orders': 'عرض جميع الطلبات',
  'add_order': 'إضافة طلب',
  'manage_workers': 'إدارة العمال',
  'view_reports': 'عرض التقارير',
  'client_name_required': 'اسم الزبونة *',
  'phone_required': 'رقم الهاتف *',
  'order_description_required': 'وصف الطلب *',
  'delivery_date_required': 'موعد التسليم *',
  'price_sar': 'السعر (ريال سعودي)',
  'measurements_cm': 'المقاسات (بالسنتيمتر)',
  'additional_notes': 'ملاحظات إضافية',
  'voice_notes_optional': 'ملاحظات صوتية (اختيارية)',
  'design_images': 'صور التصميم',
  'fabric_type': 'نوع القماش',
  'fabric_type_optional': 'نوع القماش',
  'responsible_worker': 'العامل المسؤول',
  'choose_worker': 'اختر العامل المسؤول',
  'status_and_worker': 'الحالة والعامل',
  'order_status': 'حالة الطلب',
  'additional_notes_placeholder': 'أي ملاحظات أو تفاصيل إضافية...',
  'not_specified': 'غير محدد',
  'back_to_dashboard': 'العودة إلى لوحة التحكم',
  'overview_today': 'نظرة عامة على أنشطة اليوم',
  'welcome_worker': 'مرحباً بك في مساحة العمل',

  // مفاتيح مفقودة من لوحة التحكم
  'homepage': 'الصفحة الرئيسية',
  'my_completed_orders': 'طلباتي المكتملة',
  'my_total_orders': 'إجمالي طلباتي',
  'active_orders': 'الطلبات النشطة',
  'today_appointments': 'مواعيد اليوم',
  'statistics': 'الإحصائيات',
  'no_orders_found': 'لا توجد طلبات',
  'view_all': 'عرض الكل',
  'worker_management': 'إدارة العمال',
  'reminder': 'تذكير',
  'you_have': 'لديك',
  'today_appointments_reminder': 'موعد اليوم',
  'and': 'و',
  'orders_need_follow': 'طلبات تحتاج متابعة',
  'detailed_reports': 'تقارير مفصلة',
  'worker_description': 'يمكنك هنا متابعة طلباتك المخصصة لك وتحديث حالتها',

  // مفاتيح صفحة إضافة الطلبات
  'order_add_error': 'حدث خطأ أثناء إضافة الطلب',
  'add_new_order_description': 'قم بإدخال تفاصيل الطلب الجديد بما في ذلك معلومات الزبونة والمقاسات',
  'basic_information': 'المعلومات الأساسية',
  'basic_measurements': 'المقاسات الأساسية',
  'advanced_measurements': 'المقاسات المتقدمة',
  'sleeve_measurements': 'مقاسات الأكمام',
  'length_measurements': 'مقاسات الطول',
  'cm_placeholder': 'سم',
  'shoulder': 'الكتف',
  'shoulder_circumference': 'محيط الكتف',
  'chest': 'الصدر',
  'waist': 'الخصر',
  'hips': 'الأرداف',
  'dart_length': 'طول الخياطة',
  'bodice_length': 'طول الجسم',
  'neckline': 'خط الرقبة',
  'armpit': 'الإبط',
  'sleeve_length': 'طول الكم',
  'forearm': 'الساعد',
  'cuff': 'الكم',
  'front_length': 'الطول الأمامي',
  'back_length': 'الطول الخلفي',

  // مفاتيح صفحة الطلبات
  'enter_order_number': 'أدخل رقم الطلب',
  'search_placeholder': 'البحث بالاسم أو رقم الطلب أو الوصف...',
  'search_by_text': 'البحث بالنص',
  'search_by_order_number': 'البحث برقم الطلب',
  'all_orders': 'جميع الطلبات',
  'no_orders_assigned': 'لا توجد طلبات مخصصة لك',
  'no_orders_assigned_desc': 'لم يتم تخصيص أي طلبات لك بعد',
  'no_orders_found_desc': 'لا توجد طلبات مطابقة لمعايير البحث',
  'price_label': 'السعر',
  'sar': 'ريال',
  'view': 'عرض',
  'completing': 'جاري الإنهاء...',
  'start_work': 'بدء العمل',
  'complete_order': 'إنهاء الطلب',
  'complete_order_modal_title': 'إنهاء الطلب وتحميل صور العمل المكتمل',
  'important_warning': 'تحذير مهم',
  'complete_order_warning': 'بمجرد إنهاء الطلب، لن تتمكن من تعديل حالته مرة أخرى. تأكد من تحميل جميع صور العمل المكتمل قبل المتابعة.',
  'order_deleted_successfully': 'تم حذف الطلب بنجاح',

  // مفاتيح مكون حذف الطلب
  'confirm_delete_order': 'تأكيد حذف الطلب',
  'warning_delete_order': 'تحذير: حذف الطلب',
  'delete_order_warning_message': 'لا يمكن التراجع عن هذا الإجراء. سيتم حذف الطلب وجميع البيانات المرتبطة به نهائياً.',
  'admin_email': 'بريد المدير الإلكتروني',
  'admin_password': 'كلمة مرور المدير',
  'enter_admin_email': 'أدخل بريد المدير الإلكتروني',
  'enter_admin_password': 'أدخل كلمة مرور المدير',
  'please_fill_all_fields': 'يرجى ملء جميع الحقول',
  'email_does_not_match': 'البريد الإلكتروني لا يطابق بريد المدير المسجل',
  'incorrect_password': 'كلمة المرور غير صحيحة',
  'confirm_delete': 'تأكيد الحذف',

  // مفاتيح مكون الملاحظات الصوتية
  'start_recording': 'بدء التسجيل',
  'stop_recording': 'إيقاف التسجيل',
  'click_to_record_voice_note': 'انقر لتسجيل ملاحظة صوتية',
  'voice_notes': 'الملاحظات الصوتية',
  'voice_note': 'ملاحظة صوتية',
  'microphone_access_error': 'خطأ في الوصول للميكروفون',

  // مفاتيح صفحة العمال
  'worker_added_success': 'تم إضافة العامل بنجاح',
  'error_adding_worker': 'حدث خطأ أثناء إضافة العامل',
  'worker_updated_success': 'تم تحديث العامل بنجاح',
  'error_updating_worker': 'حدث خطأ أثناء تحديث العامل',
  'worker_deleted_success': 'تم حذف العامل بنجاح',
  'worker_deactivated': 'تم إلغاء تفعيل العامل',
  'worker_activated': 'تم تفعيل العامل',
  'adding': 'جاري الإضافة...',
  'add_worker': 'إضافة عامل',
  'active': 'نشط',
  'inactive': 'غير نشط',
  'save_changes': 'حفظ التغييرات',
  'search_workers_placeholder': 'البحث عن العمال...',
  'workers_management': 'إدارة العمال',
  'view_manage_team': 'عرض وإدارة فريق العمل في ورشة التفصيل',
  'add_new_worker': 'إضافة عامل جديد',
  'add_new_worker_form': 'إضافة عامل جديد',
  'full_name_required': 'الاسم الكامل *',
  'email_required': 'البريد الإلكتروني *',
  'password_required': 'كلمة المرور *',
  'phone_required_worker': 'رقم الهاتف *',
  'enter_full_name': 'أدخل الاسم الكامل',
  'enter_email': 'أدخل البريد الإلكتروني',
  'enter_password': 'أدخل كلمة المرور',
  'enter_phone': 'أدخل رقم الهاتف',
  'specialty_required': 'التخصص *',
  'specialty_example': 'مثال: خياطة فساتين السهرة',
  'edit_worker': 'تعديل العامل',
  'new_password': 'كلمة المرور الجديدة',
  'leave_empty_no_change': 'اتركه فارغاً إذا لم ترد تغييره',
  'no_workers': 'لا يوجد عمال',
  'no_workers_found': 'لا يوجد عمال مطابقين لمعايير البحث',
  'joined_on': 'انضم في',
  'total_workers': 'إجمالي العمال',
  'active_workers': 'العمال النشطون',
  'total_completed_orders': 'إجمالي الطلبات المكتملة',
  'confirm_delete_worker': 'هل أنت متأكد من حذف هذا العامل؟',

  // مفاتيح صفحة التقارير
  'engagement_dress': 'فستان خطوبة',
  'casual_dress': 'فستان يومي',
  'other': 'أخرى',
  'this_week': 'هذا الأسبوع',
  'this_month': 'هذا الشهر',
  'this_quarter': 'هذا الربع',
  'this_year': 'هذا العام',
  'reports_analytics': 'التقارير والتحليلات',
  'monthly_trend': 'الاتجاه الشهري',
  'revenue_label': 'الإيرادات',

  // مفاتيح صفحة المواعيد
  'confirmed': 'مؤكد',
  'pm': 'مساءً',
  'am': 'صباحاً',
  'all_statuses': 'جميع الحالات',
  'all_dates': 'جميع التواريخ',
  'today': 'اليوم',
  'tomorrow': 'غداً',
  'appointments_management': 'إدارة المواعيد',
  'view_manage_appointments': 'عرض وإدارة جميع مواعيد التفصيل',
  'book_new_appointment': 'حجز موعد جديد',
  'search_appointments_placeholder': 'البحث في المواعيد...',
  'no_appointments': 'لا توجد مواعيد',
  'no_appointments_found': 'لا توجد مواعيد مطابقة لمعايير البحث',
  'created_on': 'تم الإنشاء في',
  'confirm_appointment': 'تأكيد الموعد',
  'cancel_appointment': 'إلغاء الموعد',

  // مفاتيح مكونات إضافية
  'of': 'من',
  'images_text': 'صور',

  // مفاتيح مكونات الصور والتحميل
  'max_images_reached': 'تم الوصول للحد الأقصى من الصور',
  'drop_images_here': 'اسقط الصور هنا',
  'click_or_drag_images': 'انقر أو اسحب الصور هنا',
  'image_upload_format': 'PNG, JPG, JPEG حتى 5MB',
  'max_images_text': 'الحد الأقصى',
  'order_label': 'الطلب',
  'for_client': 'للزبونة',

  // مفاتيح مكون تعديل الطلب
  'edit_order': 'تعديل الطلب',
  'order_update_error': 'حدث خطأ أثناء تحديث الطلب',
  'price_sar_required': 'السعر (ريال سعودي) *',
  'status_pending': 'في الانتظار',
  'status_in_progress': 'قيد التنفيذ',
  'status_completed': 'مكتمل',
  'status_delivered': 'تم التسليم',
  'status_cancelled': 'ملغي',

  // نصوص الفوتر
  'home': 'الرئيسية',
  'track_order': 'استعلام عن الطلب',
  'fabrics': 'الأقمشة',
  'contact_us': 'تواصلي معنا',
  'yasmin_alsham': 'ياسمين الشام',
  'custom_dress_tailoring': 'تفصيل فساتين حسب الطلب',

  // مفاتيح مكون تفاصيل الطلب (OrderModal)
  'customer_information': 'معلومات الزبونة',
  'order_date': 'تاريخ الطلب',
  'delivery_date': 'موعد التسليم',
  'assigned_worker': 'العامل المسؤول',
  'chest_bust': 'الصدر',
  'advanced_tailoring_measurements': 'مقاسات التفصيل المتقدمة',
  'additional_measurements': 'مقاسات إضافية',
  'dress_length': 'طول الفستان',
  'shoulder_width': 'عرض الكتف',
  'sleeve_length_old': 'طول الكم',
  'design_image_alt': 'صورة التصميم',
  'completed_work_images': 'صور العمل المكتمل',
  'completed_work_description': 'تم رفع صور العمل المكتمل من قبل العامل',
  'completed_work_image_alt': 'صورة العمل المكتمل',

  // مفاتيح صفحة الطلبات
  'view_manage_orders': 'عرض وإدارة جميع الطلبات',
  'order_date_label': 'تاريخ الطلب',
  'delivery_date_label': 'موعد التسليم',
  'worker_label': 'العامل',
  'fabric_label': 'القماش:',
  'notes_label': 'ملاحظات',

  // مفاتيح صفحة العمال
  'experience_years': 'سنوات الخبرة'
}

// الترجمات الإنجليزية
const enTranslations: Translations = {
  // التنقل والعناوين الرئيسية
  'dashboard': 'Dashboard',
  'orders': 'Orders',
  'appointments': 'Appointments',
  'settings': 'Settings',
  'workers': 'Workers',
  'reports': 'Reports',
  'logout': 'Logout',
  'welcome': 'Welcome',
  'welcome_back': 'Welcome Back',
  
  // الأزرار والإجراءات
  'add_new_order': 'Add New Order',
  'book_appointment': 'Book Appointment',
  'view_details': 'View Details',
  'edit': 'Edit',
  'delete': 'Delete',
  'save': 'Save',
  'cancel': 'Cancel',
  'submit': 'Submit',
  'search': 'Search',
  'filter': 'Filter',
  'export': 'Export',
  'print': 'Print',
  'back': 'Back',
  'next': 'Next',
  'previous': 'Previous',
  'close': 'Close',
  'confirm': 'Confirm',
  'loading': 'Loading...',
  'saving': 'Saving...',
  
  // حالات الطلبات
  'pending': 'Pending',
  'in_progress': 'In Progress',
  'completed': 'Completed',
  'delivered': 'Delivered',
  'cancelled': 'Cancelled',
  
  // نصوص عامة
  'name': 'Name',
  'email': 'Email',
  'phone': 'Phone',
  'address': 'Address',
  'date': 'Date',
  'time': 'Time',
  'status': 'Status',
  'price': 'Price',
  'total': 'Total',
  'description': 'Description',
  'notes': 'Notes',
  'client_name': 'Client Name',
  'client_phone': 'Client Phone',
  
  // رسائل النجاح والخطأ
  'success': 'Success',
  'error': 'Error',
  'warning': 'Warning',
  'info': 'Info',
  'order_added_success': 'Order added successfully',
  'order_updated_success': 'Order updated successfully',
  'order_deleted_success': 'Order deleted successfully',
  'fill_required_fields': 'Please fill all required fields',

  // نصوص إضافية مطلوبة
  'admin_dashboard': 'Admin Dashboard',
  'worker_dashboard': 'Worker Dashboard',
  'admin': 'Admin',
  'worker': 'Worker',
  'change_language': 'Change Language',
  'my_active_orders': 'My Active Orders',
  'completed_orders': 'Completed Orders',
  'total_orders': 'Total Orders',
  'total_revenue': 'Total Revenue',
  'recent_orders': 'Recent Orders',
  'quick_actions': 'Quick Actions',
  'view_all_orders': 'View All Orders',
  'add_order': 'Add Order',
  'manage_workers': 'Manage Workers',
  'view_reports': 'View Reports',
  'client_name_required': 'Client Name *',
  'phone_required': 'Phone Number *',
  'order_description_required': 'Order Description *',
  'delivery_date_required': 'Delivery Date *',
  'price_sar': 'Price (SAR)',
  'measurements_cm': 'Measurements (cm)',
  'additional_notes': 'Additional Notes',
  'voice_notes_optional': 'Voice Notes (Optional)',
  'design_images': 'Design Images',
  'fabric_type': 'Fabric Type',
  'fabric_type_optional': 'Fabric Type',
  'responsible_worker': 'Responsible Worker',
  'choose_worker': 'Choose Responsible Worker',
  'status_and_worker': 'Status and Worker',
  'order_status': 'Order Status',
  'additional_notes_placeholder': 'Any additional notes or details...',
  'not_specified': 'Not Specified',
  'back_to_dashboard': 'Back to Dashboard',
  'overview_today': 'Overview of today\'s activities',
  'welcome_worker': 'Welcome to your workspace',

  // مفاتيح مفقودة من لوحة التحكم
  'homepage': 'Homepage',
  'my_completed_orders': 'My Completed Orders',
  'my_total_orders': 'My Total Orders',
  'active_orders': 'Active Orders',
  'today_appointments': 'Today\'s Appointments',
  'statistics': 'Statistics',
  'no_orders_found': 'No orders found',
  'view_all': 'View All',
  'worker_management': 'Worker Management',
  'reminder': 'Reminder',
  'you_have': 'You have',
  'today_appointments_reminder': 'appointments today',
  'and': 'and',
  'orders_need_follow': 'orders that need follow-up',
  'detailed_reports': 'Detailed Reports',
  'worker_description': 'Here you can track your assigned orders and update their status',

  // مفاتيح صفحة إضافة الطلبات
  'order_add_error': 'An error occurred while adding the order',
  'add_new_order_description': 'Enter the new order details including client information and measurements',
  'basic_information': 'Basic Information',
  'basic_measurements': 'Basic Measurements',
  'advanced_measurements': 'Advanced Measurements',
  'sleeve_measurements': 'Sleeve Measurements',
  'length_measurements': 'Length Measurements',
  'cm_placeholder': 'cm',
  'shoulder': 'Shoulder',
  'shoulder_circumference': 'Shoulder Circumference',
  'chest': 'Chest',
  'waist': 'Waist',
  'hips': 'Hips',
  'dart_length': 'Dart Length',
  'bodice_length': 'Bodice Length',
  'neckline': 'Neckline',
  'armpit': 'Armpit',
  'sleeve_length': 'Sleeve Length',
  'forearm': 'Forearm',
  'cuff': 'Cuff',
  'front_length': 'Front Length',
  'back_length': 'Back Length',

  // مفاتيح صفحة الطلبات
  'enter_order_number': 'Enter order number',
  'search_placeholder': 'Search by name, order number, or description...',
  'search_by_text': 'Search by Text',
  'search_by_order_number': 'Search by Order Number',
  'all_orders': 'All Orders',
  'no_orders_assigned': 'No orders assigned to you',
  'no_orders_assigned_desc': 'No orders have been assigned to you yet',
  'no_orders_found_desc': 'No orders found matching the search criteria',
  'price_label': 'Price',
  'sar': 'SAR',
  'view': 'View',
  'completing': 'Completing...',
  'start_work': 'Start Work',
  'complete_order': 'Complete Order',
  'complete_order_modal_title': 'Complete Order and Upload Finished Work Images',
  'important_warning': 'Important Warning',
  'complete_order_warning': 'Once you complete the order, you will not be able to modify its status again. Make sure to upload all finished work images before proceeding.',
  'order_deleted_successfully': 'Order deleted successfully',

  // مفاتيح مكون حذف الطلب
  'confirm_delete_order': 'Confirm Delete Order',
  'warning_delete_order': 'Warning: Delete Order',
  'delete_order_warning_message': 'This action cannot be undone. The order and all associated data will be permanently deleted.',
  'admin_email': 'Admin Email',
  'admin_password': 'Admin Password',
  'enter_admin_email': 'Enter admin email',
  'enter_admin_password': 'Enter admin password',
  'please_fill_all_fields': 'Please fill all fields',
  'email_does_not_match': 'Email does not match the registered admin email',
  'incorrect_password': 'Incorrect password',
  'confirm_delete': 'Confirm Delete',

  // مفاتيح مكون الملاحظات الصوتية
  'start_recording': 'Start Recording',
  'stop_recording': 'Stop Recording',
  'click_to_record_voice_note': 'Click to record a voice note',
  'voice_notes': 'Voice Notes',
  'voice_note': 'Voice Note',
  'microphone_access_error': 'Microphone access error',

  // مفاتيح صفحة العمال
  'worker_added_success': 'Worker added successfully',
  'error_adding_worker': 'Error adding worker',
  'worker_updated_success': 'Worker updated successfully',
  'error_updating_worker': 'Error updating worker',
  'worker_deleted_success': 'Worker deleted successfully',
  'worker_deactivated': 'Worker deactivated',
  'worker_activated': 'Worker activated',
  'adding': 'Adding...',
  'add_worker': 'Add Worker',
  'active': 'Active',
  'inactive': 'Inactive',
  'save_changes': 'Save Changes',
  'search_workers_placeholder': 'Search workers...',
  'workers_management': 'Workers Management',
  'view_manage_team': 'View and manage the tailoring workshop team',
  'add_new_worker': 'Add New Worker',
  'add_new_worker_form': 'Add New Worker',
  'full_name_required': 'Full Name *',
  'email_required': 'Email *',
  'password_required': 'Password *',
  'phone_required_worker': 'Phone Number *',
  'enter_full_name': 'Enter full name',
  'enter_email': 'Enter email',
  'enter_password': 'Enter password',
  'enter_phone': 'Enter phone number',
  'specialty_required': 'Specialty *',
  'specialty_example': 'Example: Evening dress tailoring',
  'edit_worker': 'Edit Worker',
  'new_password': 'New Password',
  'leave_empty_no_change': 'Leave empty if you don\'t want to change it',
  'no_workers': 'No workers',
  'no_workers_found': 'No workers found matching the search criteria',
  'joined_on': 'Joined on',
  'total_workers': 'Total Workers',
  'active_workers': 'Active Workers',
  'total_completed_orders': 'Total Completed Orders',
  'confirm_delete_worker': 'Are you sure you want to delete this worker?',

  // مفاتيح صفحة التقارير
  'engagement_dress': 'Engagement Dress',
  'casual_dress': 'Casual Dress',
  'other': 'Other',
  'this_week': 'This Week',
  'this_month': 'This Month',
  'this_quarter': 'This Quarter',
  'this_year': 'This Year',
  'reports_analytics': 'Reports & Analytics',
  'monthly_trend': 'Monthly Trend',
  'revenue_label': 'Revenue',

  // مفاتيح صفحة المواعيد
  'confirmed': 'Confirmed',
  'pm': 'PM',
  'am': 'AM',
  'all_statuses': 'All Statuses',
  'all_dates': 'All Dates',
  'today': 'Today',
  'tomorrow': 'Tomorrow',
  'appointments_management': 'Appointments Management',
  'view_manage_appointments': 'View and manage all tailoring appointments',
  'book_new_appointment': 'Book New Appointment',
  'search_appointments_placeholder': 'Search appointments...',
  'no_appointments': 'No appointments',
  'no_appointments_found': 'No appointments found matching the search criteria',
  'created_on': 'Created on',
  'confirm_appointment': 'Confirm Appointment',
  'cancel_appointment': 'Cancel Appointment',

  // مفاتيح مكونات إضافية
  'of': 'of',
  'images_text': 'images',

  // مفاتيح مكونات الصور والتحميل
  'max_images_reached': 'Maximum images reached',
  'drop_images_here': 'Drop images here',
  'click_or_drag_images': 'Click or drag images here',
  'image_upload_format': 'PNG, JPG, JPEG up to 5MB',
  'max_images_text': 'Maximum',
  'order_label': 'Order',
  'for_client': 'For client',

  // مفاتيح مكون تعديل الطلب
  'edit_order': 'Edit Order',
  'order_update_error': 'Error updating order',
  'price_sar_required': 'Price (SAR) *',
  'status_pending': 'Pending',
  'status_in_progress': 'In Progress',
  'status_completed': 'Completed',
  'status_delivered': 'Delivered',
  'status_cancelled': 'Cancelled',

  // نصوص الفوتر
  'home': 'Home',
  'track_order': 'Track Order',
  'fabrics': 'Fabrics',
  'contact_us': 'Contact Us',
  'yasmin_alsham': 'Yasmin Alsham',
  'custom_dress_tailoring': 'Custom Dress Tailoring',

  // مفاتيح مكون تفاصيل الطلب (OrderModal)
  'customer_information': 'Customer Information',
  'order_date': 'Order Date',
  'delivery_date': 'Delivery Date',
  'assigned_worker': 'Assigned Worker',
  'chest_bust': 'Chest/Bust',
  'advanced_tailoring_measurements': 'Advanced Tailoring Measurements',
  'additional_measurements': 'Additional Measurements',
  'dress_length': 'Dress Length',
  'shoulder_width': 'Shoulder Width',
  'sleeve_length_old': 'Sleeve Length',
  'design_image_alt': 'Design Image',
  'completed_work_images': 'Completed Work Images',
  'completed_work_description': 'Completed work images uploaded by worker',
  'completed_work_image_alt': 'Completed Work Image',

  // مفاتيح صفحة الطلبات
  'view_manage_orders': 'View and manage all orders',
  'order_date_label': 'Order Date',
  'delivery_date_label': 'Delivery Date',
  'worker_label': 'Worker',
  'fabric_label': 'Fabric:',
  'notes_label': 'Notes',

  // مفاتيح صفحة العمال
  'experience_years': 'Years of Experience'
}

// Hook للترجمة
export function useTranslation() {
  const [language, setLanguage] = useState<'ar' | 'en'>('ar')

  // تحميل اللغة المحفوظة عند بدء التطبيق
  useEffect(() => {
    const savedLanguage = localStorage.getItem('dashboard-language') as 'ar' | 'en'
    if (savedLanguage) {
      setLanguage(savedLanguage)
    }
  }, [])

  // حفظ اللغة عند تغييرها
  const changeLanguage = (newLanguage: 'ar' | 'en') => {
    setLanguage(newLanguage)
    localStorage.setItem('dashboard-language', newLanguage)
  }

  // دالة الترجمة
  const t = (key: TranslationKey): string => {
    const translations = language === 'ar' ? arTranslations : enTranslations
    const translation = translations[key]
    
    if (typeof translation === 'string') {
      return translation
    }
    
    // إذا لم توجد الترجمة، أرجع المفتاح نفسه
    return key
  }

  // التحقق من اللغة الحالية
  const isArabic = language === 'ar'
  const isEnglish = language === 'en'

  return {
    language,
    changeLanguage,
    t,
    isArabic,
    isEnglish
  }
}
