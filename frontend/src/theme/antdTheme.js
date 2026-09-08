import { theme } from 'antd'

const shared = {
  token: {
    colorPrimary: '#1A5F4A',
    colorInfo: '#1A5F4A',
    colorSuccess: '#2F7D57',
    colorWarning: '#C48A2A',
    colorError: '#B42318',
    colorText: '#1C1917',
    colorTextSecondary: '#6B6560',
    colorBorder: '#E6E1D8',
    colorBorderSecondary: '#EEEBE4',
    borderRadius: 8,
    borderRadiusLG: 12,
    fontFamily: "'IBM Plex Sans', 'Source Sans 3', system-ui, sans-serif",
    fontSize: 14,
    controlHeight: 36,
    boxShadow: 'none',
    boxShadowSecondary: '0 8px 24px rgba(28, 25, 23, 0.08)',
  },
  components: {
    Layout: {
      headerBg: '#FFFFFF',
      siderBg: '#FFFFFF',
      bodyBg: '#F4F2EC',
      headerHeight: 56,
      headerPadding: '0 20px',
    },
    Menu: {
      itemBorderRadius: 8,
      itemMarginInline: 8,
      itemHeight: 40,
      itemSelectedBg: '#E8F2EE',
      itemSelectedColor: '#1A5F4A',
      itemHoverBg: '#F4F2EC',
      subMenuItemBg: 'transparent',
    },
    Card: {
      headerFontSize: 14,
      headerHeight: 48,
      paddingLG: 20,
    },
    Table: {
      headerBg: '#F4F2EC',
      headerColor: '#6B6560',
      rowHoverBg: '#F8F6F1',
    },
    Button: {
      fontWeight: 600,
    },
    Statistic: {
      contentFontSize: 32,
      titleFontSize: 13,
    },
    Select: {
      hoverBorderColor: '#D9D9D9',
      activeBorderColor: '#D9D9D9',
      activeOutlineColor: 'transparent',
      optionActiveBg: '#E6EAF1',
      optionSelectedBg: '#EAEEF4',
      optionSelectedColor: '#1C1917',
      optionSelectedFontWeight: 400,
      // Paints an option that is both selected and keyboard-active.
      controlItemBgActiveHover: '#E6EAF1',
    },
    DatePicker: {
      hoverBorderColor: '#D9D9D9',
      activeBorderColor: '#D9D9D9',
      activeShadow: 'none',
      activeOutlineColor: 'transparent',
    },
  },
}

export const lightTheme = {
  ...shared,
  algorithm: theme.defaultAlgorithm,
}

export const darkTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    ...shared.token,
    colorText: '#F5F2EC',
    colorTextSecondary: '#A8A29E',
    colorBorder: '#3F3B36',
    colorBorderSecondary: '#2C2926',
    colorBgContainer: '#1C1917',
    colorBgLayout: '#141210',
  },
  components: {
    ...shared.components,
    Layout: {
      headerBg: '#1C1917',
      siderBg: '#1C1917',
      bodyBg: '#141210',
      headerHeight: 56,
      headerPadding: '0 20px',
    },
    Menu: {
      ...shared.components.Menu,
      itemSelectedBg: '#243830',
      itemSelectedColor: '#9FE1C3',
      itemHoverBg: '#2A2623',
    },
    Tabs: {
      itemColor: '#A8A29E',
      itemHoverColor: '#E7E5E4',
      itemSelectedColor: '#9FE1C3',
      itemActiveColor: '#9FE1C3',
      inkBarColor: '#9FE1C3',
    },
    Table: {
      headerBg: '#241F1C',
      headerColor: '#A8A29E',
      rowHoverBg: '#241F1C',
    },
    Select: {
      hoverBorderColor: '#3F3B36',
      activeBorderColor: '#3F3B36',
      activeOutlineColor: 'transparent',
      optionActiveBg: '#332F2B',
      optionSelectedBg: '#3A352F',
      optionSelectedColor: '#F5F2EC',
      optionSelectedFontWeight: 400,
      controlItemBgActiveHover: '#332F2B',
    },
    DatePicker: {
      hoverBorderColor: '#3F3B36',
      activeBorderColor: '#3F3B36',
      activeShadow: 'none',
      activeOutlineColor: 'transparent',
    },
  },
}
