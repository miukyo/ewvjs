export interface ContextMenuItem {
    label?: string;
    id?: string;
    type?: 'normal' | 'separator' | 'checkbox' | 'submenu';
    checked?: boolean;
    enabled?: boolean;
    submenu?: ContextMenuItem[];
    click?: () => void;
}

export interface WindowOptions {
    title?: string;
    url?: string;
    html?: string;
    width?: number;
    height?: number;
    min_width?: number;
    min_height?: number;
    x?: number;
    y?: number;
    resizable?: boolean;
    fullscreen?: boolean;
    hidden?: boolean;
    frameless?: boolean;
    focus?: boolean;
    minimized?: boolean;
    maximized?: boolean;
    on_top?: boolean;
    confirm_close?: boolean;
    background_color?: string;
    transparent?: boolean;
    vibrancy?: boolean;
    dark_mode?: boolean;
    title_bar?: boolean;
    icon?: string;
    session?: {
        persist?: boolean;
        path?: string;
        envname?: string;
    };
    additional_args?: string;
    jsCallback?: (message: any) => void;
    debug?: boolean;

    on_close?: () => void;
    on_show?: () => void;
    on_hide?: () => void;
    on_resize?: (size: { width: number; height: number; state: string }) => void;
    on_move?: (pos: { x: number; y: number }) => void;
    on_focus?: () => void;
    on_blur?: () => void;
    on_maximize?: () => void;
    on_minimize?: () => void;
    on_restore?: () => void;
}
