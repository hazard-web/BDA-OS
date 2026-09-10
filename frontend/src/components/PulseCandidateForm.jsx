import { useEffect, useMemo } from 'react'
import {
  App,
  Button,
  Checkbox,
  Col,
  DatePicker,
  Form,
  Input,
  Row,
  Select,
  Space,
  Typography,
  Upload,
} from 'antd'
import { DeleteOutlined, FileTextOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { companyEmailRequiredMessage, isCompanyEmail, normalizeCompanyEmail } from '../utils/companyDomain'

export const INDIA_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
]

export const COUNTRIES = ['India', 'United States', 'United Kingdom', 'Singapore', 'United Arab Emirates']
export const DEPARTMENTS = ['Engineering', 'Human Resources', 'Finance', 'Operations', 'Sales', 'Design', 'Product', 'Support']
export const LOCATIONS = ['Ghaziabad', 'Noida', 'Delhi NCR', 'Bengaluru', 'Remote', 'Hybrid']
export const TITLES = ['Software Engineer', 'HR Executive', 'Intern', 'Manager', 'Team Lead', 'Associate', 'Analyst']
export const HIRE_SOURCES = ['Referral', 'Job board', 'Campus', 'Agency', 'Direct', 'Career page']
export const GENDERS = ['Male', 'Female', 'Other']
export const COUNTRY_CODES = [
  { value: '+91', label: '+91' },
  { value: '+1', label: '+1' },
  { value: '+44', label: '+44' },
  { value: '+65', label: '+65' },
  { value: '+971', label: '+971' },
]

const MAX_BYTES = 5 * 1024 * 1024

function readFile(file, kinds) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_BYTES) {
      reject(new Error('Max. size is 5 MB'))
      return
    }
    const mime = String(file.type || '').toLowerCase()
    const ok = kinds === 'image'
      ? mime.startsWith('image/')
      : kinds === 'id'
        ? mime.startsWith('image/') || mime === 'application/pdf'
        : mime.startsWith('image/') || mime === 'application/pdf' || mime.includes('word')
    if (!ok) {
      reject(new Error(
        kinds === 'image'
          ? 'Use JPG, PNG, GIF, or JPEG'
          : kinds === 'id'
            ? 'Use JPG, PNG, JPEG, or PDF'
            : 'Use PDF, Word, or an image',
      ))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      resolve({
        name: file.name,
        mime: file.type,
        size: file.size,
        data: reader.result,
      })
    }
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

function isPreviewableImage(value) {
  const mime = String(value?.mime || '').toLowerCase()
  const data = String(value?.data || '')
  return mime.startsWith('image/') || data.startsWith('data:image/')
}

function previewSrc(value) {
  if (!isPreviewableImage(value)) return ''
  const data = String(value.data || '')
  if (data.startsWith('data:')) return data
  return `data:${value.mime || 'image/jpeg'};base64,${data}`
}

function FileSlot({ value, onChange, kinds, label, disabled, compact }) {
  const { message } = App.useApp()
  const accept = kinds === 'image' ? 'image/*' : kinds === 'id' ? 'image/*,.pdf,application/pdf' : undefined
  const preview = previewSrc(value)
  const kindClass = kinds === 'image' ? 'image' : kinds === 'id' ? 'id' : 'doc'

  const pick = async (file) => {
    try {
      onChange(await readFile(file, kinds))
    } catch (err) {
      message.error(err.message || 'Could not upload file')
    }
    return false
  }

  const card = (
    <div className={`ob-upload-card ob-float-card is-${kindClass}${compact ? ' is-compact' : ''}${value?.name ? ' has-file' : ' is-empty'}`}>
      {preview ? (
        <img className="ob-upload-preview" src={preview} alt={label || value?.name || ''} />
      ) : value?.name ? (
        <div className="ob-upload-doc">
          <FileTextOutlined />
          <span>{value.name}</span>
        </div>
      ) : (
        <div className="ob-upload-empty">
          <UploadOutlined />
          <span>{kinds === 'image' ? 'Add photo' : 'Upload'}</span>
          <small>{kinds === 'image' ? 'JPG or PNG' : 'JPG, PNG, or PDF'}</small>
        </div>
      )}
      {value?.name && !disabled ? (
        <div className="ob-upload-tools">
          <Upload maxCount={1} accept={accept} showUploadList={false} beforeUpload={pick}>
            <button type="button" className="ob-upload-act is-replace">Replace</button>
          </Upload>
          {preview && !compact ? <span className="ob-upload-fname">{value.name}</span> : null}
          <button type="button" className="ob-upload-act is-remove" onClick={() => onChange(null)}>
            Remove
          </button>
        </div>
      ) : value?.name && disabled ? (
        <p className="ob-upload-caption">{value.name}</p>
      ) : null}
    </div>
  )

  if (disabled || value?.name) return card

  return (
    <Upload className="ob-upload-hit" maxCount={1} accept={accept} showUploadList={false} beforeUpload={pick}>
      {card}
    </Upload>
  )
}

function hasUpload(value) {
  return Boolean(value?.data || value?.name)
}

function requireUpload(message) {
  return [{
    validator: (_, value) => (
      hasUpload(value) ? Promise.resolve() : Promise.reject(new Error(message))
    ),
  }]
}

function AddressFields({ prefix, disabled }) {
  return (
    <div className={`ob-address-fields${disabled ? ' is-off' : ''}`}>
      <Form.Item name={[prefix, 'line1']}>
        <Input placeholder="Address line 1" disabled={disabled} />
      </Form.Item>
      <Form.Item name={[prefix, 'line2']}>
        <Input placeholder="Address line 2" disabled={disabled} />
      </Form.Item>
      <Form.Item name={[prefix, 'city']}>
        <Input placeholder="City" disabled={disabled} />
      </Form.Item>
      <div className="ob-address-split">
        <Form.Item name={[prefix, 'country']}>
          <Select
            placeholder="Select Country"
            disabled={disabled}
            options={COUNTRIES.map((c) => ({ value: c, label: c }))}
            showSearch
          />
        </Form.Item>
        <Form.Item name={[prefix, 'state']}>
          <Select
            placeholder="Select State"
            disabled={disabled}
            options={INDIA_STATES.map((c) => ({ value: c, label: c }))}
            showSearch
          />
        </Form.Item>
      </div>
      <Form.Item name={[prefix, 'postalCode']}>
        <Input placeholder="Postal Code" disabled={disabled} />
      </Form.Item>
    </div>
  )
}

export const emptyCandidate = {
  firstName: '',
  lastName: '',
  email: '',
  officialEmail: '',
  phone: '',
  countryCode: '+91',
  dob: null,
  gender: undefined,
  emergencyContact: { name: '', relationship: '', phone: '' },
  uan: '',
  aadhaar: '',
  pan: '',
  photo: null,
  aadhaarFront: null,
  aadhaarBack: null,
  panFront: null,
  panBack: null,
  presentAddress: { line1: '', line2: '', city: '', country: 'India', state: '', postalCode: '' },
  permanentAddress: { line1: '', line2: '', city: '', country: 'India', state: '', postalCode: '' },
  sameAsPresent: false,
  experienceYears: '',
  sourceOfHire: undefined,
  skillSet: '',
  highestQualification: '',
  additionalInfo: '',
  workLocation: undefined,
  title: undefined,
  currentSalary: '',
  department: undefined,
  offerLetter: null,
  tentativeJoiningDate: null,
  education: [{ schoolName: '', degree: '', fieldOfStudy: '', dateOfCompletion: '', additionalNotes: '' }],
  experience: [{ occupation: '', company: '', summary: '', duration: '', currentlyWorkHere: undefined }],
}

export function valuesFromCandidate(row) {
  if (!row) return emptyCandidate
  return {
    ...emptyCandidate,
    ...row,
    countryCode: row.countryCode || '+91',
    dob: row.dob ? dayjs(row.dob) : null,
    gender: row.gender || undefined,
    emergencyContact: { ...emptyCandidate.emergencyContact, ...(row.emergencyContact || {}) },
    photo: row.photo?.data || row.photo?.name ? row.photo : null,
    aadhaarFront: row.aadhaarFront?.data || row.aadhaarFront?.name ? row.aadhaarFront : null,
    aadhaarBack: row.aadhaarBack?.data || row.aadhaarBack?.name ? row.aadhaarBack : null,
    panFront: row.panFront?.data || row.panFront?.name ? row.panFront : null,
    panBack: row.panBack?.data || row.panBack?.name ? row.panBack : null,
    offerLetter: row.offerLetter?.data || row.offerLetter?.name ? row.offerLetter : null,
    presentAddress: { ...emptyCandidate.presentAddress, ...(row.presentAddress || {}) },
    permanentAddress: { ...emptyCandidate.permanentAddress, ...(row.permanentAddress || {}) },
    tentativeJoiningDate: row.tentativeJoiningDate ? dayjs(row.tentativeJoiningDate) : null,
    education: row.education?.length ? row.education : emptyCandidate.education,
    experience: row.experience?.length ? row.experience : emptyCandidate.experience,
  }
}

export function payloadFromValues(values, { draft, mode = 'admin' } = {}) {
  const joining = values.tentativeJoiningDate
  if (mode === 'employee') {
    return {
      firstName: values.firstName,
      lastName: values.lastName,
      phone: values.phone,
      countryCode: values.countryCode,
      dob: values.dob ? (values.dob.toISOString ? values.dob.toISOString() : values.dob) : null,
      gender: values.gender || '',
      emergencyContact: {
        name: values.emergencyContact?.name || '',
        relationship: values.emergencyContact?.relationship || '',
        phone: values.emergencyContact?.phone || '',
      },
      aadhaar: values.aadhaar,
      pan: values.pan,
      photo: values.photo?.data ? values.photo : undefined,
      aadhaarFront: values.aadhaarFront?.data ? values.aadhaarFront : undefined,
      aadhaarBack: values.aadhaarBack?.data ? values.aadhaarBack : undefined,
      panFront: values.panFront?.data ? values.panFront : undefined,
      panBack: values.panBack?.data ? values.panBack : undefined,
      presentAddress: values.presentAddress,
      permanentAddress: values.permanentAddress,
      sameAsPresent: Boolean(values.sameAsPresent),
      experienceYears: values.experienceYears,
      skillSet: values.skillSet,
      highestQualification: values.highestQualification,
      additionalInfo: values.additionalInfo,
      education: values.education,
      experience: values.experience,
    }
  }
  return {
    draft: Boolean(draft),
    firstName: values.firstName,
    lastName: values.lastName,
    email: values.email,
    officialEmail: normalizeCompanyEmail(values.officialEmail),
    department: values.department,
    sourceOfHire: values.sourceOfHire,
    workLocation: values.workLocation,
    title: values.title,
    additionalInfo: values.additionalInfo,
    offerLetter: values.offerLetter?.data ? values.offerLetter : undefined,
    tentativeJoiningDate: joining ? (joining.toISOString ? joining.toISOString() : joining) : null,
  }
}

export const EMPLOYEE_STEPS = [
  { key: 'you', label: 'You' },
  { key: 'id', label: 'Identity' },
  { key: 'address', label: 'Address' },
  { key: 'work', label: 'Work' },
]

export const EMPLOYEE_STEP_FIELDS = {
  you: [
    'firstName',
    'lastName',
    'phone',
    'dob',
    'gender',
    ['emergencyContact', 'name'],
    ['emergencyContact', 'phone'],
  ],
  id: ['aadhaarFront', 'aadhaarBack', 'panFront'],
  address: [],
  work: [],
}

function dobDisabledDate(current) {
  return Boolean(current && current.isAfter(dayjs(), 'day'))
}

function YouPersonalFields({ disabled, required }) {
  const rules = required && !disabled
  return (
    <>
      <Col xs={24} md={12}>
        <Form.Item
          name="dob"
          label="Date of birth"
          rules={rules ? [{ required: true, message: 'Date of birth is required' }] : []}
        >
          <DatePicker
            format="DD-MMM-YYYY"
            style={{ width: '100%' }}
            placeholder="dd-MMM-yyyy"
            disabled={disabled}
            disabledDate={dobDisabledDate}
            inputReadOnly
          />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item
          name="gender"
          label="Gender"
          rules={rules ? [{ required: true, message: 'Gender is required' }] : []}
        >
          <Select
            placeholder="Select"
            disabled={disabled}
            options={GENDERS.map((item) => ({ value: item, label: item }))}
          />
        </Form.Item>
      </Col>
    </>
  )
}

function EmergencyFields({ disabled, required }) {
  const rules = required && !disabled
  return (
    <div className="ob-you-emergency">
      <p className="ob-you-emergency-label">Emergency contact</p>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            name={['emergencyContact', 'name']}
            label="Name"
            rules={rules ? [{ required: true, message: 'Name is required' }] : []}
          >
            <Input autoComplete="off" disabled={disabled} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name={['emergencyContact', 'relationship']} label="Relationship">
            <Input placeholder="e.g. Parent, Spouse" disabled={disabled} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name={['emergencyContact', 'phone']}
            label="Phone"
            rules={rules ? [{ required: true, message: 'Phone is required' }] : []}
          >
            <Input inputMode="tel" autoComplete="tel" disabled={disabled} />
          </Form.Item>
        </Col>
      </Row>
    </div>
  )
}

function EmployeeFillFields({ disabled, requireDocs, variant = 'admin', step = 'you' }) {
  const sameAsPresent = Form.useWatch('sameAsPresent')
  const presentAddress = Form.useWatch('presentAddress')
  const form = Form.useFormInstance()
  const publicLayout = variant === 'public'
  const show = (key) => !publicLayout || step === key

  useEffect(() => {
    if (!disabled && sameAsPresent && presentAddress) {
      form.setFieldValue('permanentAddress', presentAddress)
    }
  }, [disabled, sameAsPresent, presentAddress, form])

  const docRules = requireDocs && !disabled ? requireUpload : () => []

  return (
    <>
      {publicLayout ? (
        <div className="ob-step" hidden={!show('you')}>
          <div className="ob-you-grid">
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="firstName"
                  label="First name"
                  rules={[{ required: true, message: 'First name is required' }]}
                >
                  <Input autoComplete="given-name" disabled={disabled} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="lastName"
                  label="Last name"
                  rules={[{ required: true, message: 'Last name is required' }]}
                >
                  <Input autoComplete="family-name" disabled={disabled} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="email" label="Email">
                  <Input autoComplete="email" disabled />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Phone" required={!disabled}>
                  <Space.Compact className="ob-phone">
                    <Form.Item name="countryCode" noStyle>
                      <Select options={COUNTRY_CODES} style={{ width: 88 }} disabled={disabled} />
                    </Form.Item>
                    <Form.Item
                      name="phone"
                      noStyle
                      rules={disabled ? [] : [{ required: true, message: 'Phone is required' }]}
                    >
                      <Input inputMode="tel" autoComplete="tel" disabled={disabled} />
                    </Form.Item>
                  </Space.Compact>
                </Form.Item>
              </Col>
              <YouPersonalFields disabled={disabled} required={!disabled} />
            </Row>
            <Form.Item name="photo" label="Photo" className="ob-you-photo">
              <FileSlot kinds="image" disabled={disabled} compact />
            </Form.Item>
          </div>
          <EmergencyFields disabled={disabled} required={!disabled} />
        </div>
      ) : (
        <>
          <Row gutter={24}>
            <Col xs={24} md={12}>
              <Form.Item label="Phone" required={!disabled}>
                <Space.Compact className="ob-phone">
                  <Form.Item name="countryCode" noStyle>
                    <Select options={COUNTRY_CODES} style={{ width: 88 }} disabled={disabled} />
                  </Form.Item>
                  <Form.Item
                    name="phone"
                    noStyle
                    rules={disabled ? [] : [{ required: true, message: 'Phone is required' }]}
                  >
                    <Input inputMode="tel" autoComplete="tel" disabled={disabled} />
                  </Form.Item>
                </Space.Compact>
              </Form.Item>
            </Col>
            <YouPersonalFields disabled={disabled} required={!disabled} />
            <Col span={24}>
              <EmergencyFields disabled={disabled} required={!disabled} />
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="aadhaar" label="Aadhaar card number">
                <Input disabled={disabled} />
              </Form.Item>
              <Form.Item name="pan" label="PAN card number">
                <Input placeholder="ABCDE1234F" disabled={disabled} />
              </Form.Item>
              <Form.Item name="photo" label="Photo">
                <FileSlot
                  kinds="image"
                  disabled={disabled}
                  hint="Files supported: JPG, PNG, GIF, JPEG · Max. size is 5 MB"
                />
              </Form.Item>
            </Col>
          </Row>
        </>
      )}

      <div className="ob-step" hidden={!show('id')}>
        {publicLayout ? null : <Typography.Title level={5}>Identity documents</Typography.Title>}
        <div className="ob-id-grid">
          <div className="ob-id-card ob-float-card">
            <div className="ob-id-head">
              <p className="ob-id-name">Aadhaar</p>
            </div>
            {publicLayout ? (
              <Form.Item name="aadhaar" label="Number">
                <Input disabled={disabled} />
              </Form.Item>
            ) : null}
            <div className="ob-id-sides">
              <Form.Item
                name="aadhaarFront"
                label="Front"
                required={Boolean(requireDocs && !disabled)}
                rules={docRules('Upload Aadhaar front')}
              >
                <FileSlot kinds="id" label="Aadhaar front" hint="Front" disabled={disabled} compact={publicLayout} />
              </Form.Item>
              <Form.Item
                name="aadhaarBack"
                label="Back"
                required={Boolean(requireDocs && !disabled)}
                rules={docRules('Upload Aadhaar back')}
              >
                <FileSlot kinds="id" label="Aadhaar back" hint="Back" disabled={disabled} compact={publicLayout} />
              </Form.Item>
            </div>
          </div>
          <div className="ob-id-card ob-float-card">
            <div className="ob-id-head">
              <p className="ob-id-name">PAN</p>
            </div>
            {publicLayout ? (
              <Form.Item name="pan" label="Number">
                <Input placeholder="ABCDE1234F" disabled={disabled} />
              </Form.Item>
            ) : null}
            <div className="ob-id-sides ob-id-sides-single">
              <Form.Item
                name="panFront"
                label="Front"
                required={Boolean(requireDocs && !disabled)}
                rules={docRules('Upload PAN front')}
              >
                <FileSlot kinds="id" label="PAN front" hint="Front" disabled={disabled} compact={publicLayout} />
              </Form.Item>
            </div>
          </div>
        </div>
      </div>

      <div className="ob-step" hidden={!show('address')}>
        {publicLayout ? null : <Typography.Title level={5}>Address</Typography.Title>}
        <div className={publicLayout ? 'ob-address-pair' : undefined}>
          <div className={publicLayout ? 'ob-id-card ob-float-card' : 'ob-address-block'}>
            {publicLayout ? <div className="ob-id-head"><p className="ob-id-name">Present</p></div> : <div className="ob-address-label">Present</div>}
            <div className={publicLayout ? 'ob-card-body' : undefined}>
              <AddressFields prefix="presentAddress" disabled={disabled} />
            </div>
          </div>
          <div className={publicLayout ? 'ob-id-card ob-float-card' : 'ob-address-block'}>
            {publicLayout ? (
              <div className="ob-id-head">
                <p className="ob-id-name">Permanent</p>
              </div>
            ) : (
              <div className="ob-address-label">Permanent</div>
            )}
            <div className={publicLayout ? 'ob-card-body' : undefined}>
              <Form.Item name="sameAsPresent" valuePropName="checked" className="ob-same">
                <Checkbox disabled={disabled}>Same as present</Checkbox>
              </Form.Item>
              <AddressFields prefix="permanentAddress" disabled={disabled || Boolean(sameAsPresent)} />
            </div>
          </div>
        </div>
      </div>

      <div className="ob-step" hidden={!show('work')}>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="experienceYears" label="Experience">
              <Input placeholder="e.g. 4 years" disabled={disabled} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="highestQualification" label="Qualification">
              <Input disabled={disabled} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="skillSet" label="Skills">
              <Input disabled={disabled} />
            </Form.Item>
          </Col>
        </Row>
        <Form.List name="education">
          {(fields, { add, remove }) => (
            <>
              <div className="ob-section-head">
                <Typography.Title level={5}>Education</Typography.Title>
                {disabled ? null : (
                  <Button type="link" icon={<PlusOutlined />} onClick={() => add()}>
                    Add
                  </Button>
                )}
              </div>
              {publicLayout ? (
                <div className="ob-entry-list">
                  {fields.map((field) => (
                    <div className="ob-entry-card" key={field.key}>
                      <Row gutter={16}>
                        <Col xs={24} md={12}>
                          <Form.Item name={[field.name, 'schoolName']} label="School">
                            <Input disabled={disabled} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item name={[field.name, 'degree']} label="Degree">
                            <Input disabled={disabled} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item name={[field.name, 'fieldOfStudy']} label="Field">
                            <Input disabled={disabled} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item name={[field.name, 'dateOfCompletion']} label="Year">
                            <Input placeholder="YYYY" disabled={disabled} />
                          </Form.Item>
                        </Col>
                      </Row>
                      {disabled ? null : (
                        <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove education" onClick={() => remove(field.name)}>
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ob-grid-table">
                  <div className="ob-grid-head">
                    <span>School Name</span>
                    <span>Degree/Diploma</span>
                    <span>Field(s) of Study</span>
                    <span>Date of Completion</span>
                    <span>Additional Notes</span>
                    <span />
                  </div>
                  {fields.map((field) => (
                    <div className="ob-grid-row" key={field.key}>
                      <Form.Item name={[field.name, 'schoolName']}><Input disabled={disabled} /></Form.Item>
                      <Form.Item name={[field.name, 'degree']}><Input disabled={disabled} /></Form.Item>
                      <Form.Item name={[field.name, 'fieldOfStudy']}><Input disabled={disabled} /></Form.Item>
                      <Form.Item name={[field.name, 'dateOfCompletion']}><Input placeholder="MMM yyyy" disabled={disabled} /></Form.Item>
                      <Form.Item name={[field.name, 'additionalNotes']}><Input.TextArea rows={1} disabled={disabled} /></Form.Item>
                      {disabled ? <span /> : (
                        <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove education row" onClick={() => remove(field.name)} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Form.List>
        <Form.List name="experience">
          {(fields, { add, remove }) => (
            <>
              <div className="ob-section-head">
                <Typography.Title level={5}>Experience</Typography.Title>
                {disabled ? null : (
                  <Button type="link" icon={<PlusOutlined />} onClick={() => add()}>
                    Add
                  </Button>
                )}
              </div>
              {publicLayout ? (
                <div className="ob-entry-list">
                  {fields.map((field) => (
                    <div className="ob-entry-card" key={field.key}>
                      <Row gutter={16}>
                        <Col xs={24} md={12}>
                          <Form.Item name={[field.name, 'occupation']} label="Role">
                            <Input disabled={disabled} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item name={[field.name, 'company']} label="Company">
                            <Input disabled={disabled} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item name={[field.name, 'duration']} label="Duration">
                            <Input placeholder="e.g. 2 years" disabled={disabled} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item name={[field.name, 'currentlyWorkHere']} label="Current">
                            <Select placeholder="Select" allowClear disabled={disabled} options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
                          </Form.Item>
                        </Col>
                      </Row>
                      {disabled ? null : (
                        <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove experience" onClick={() => remove(field.name)}>
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ob-grid-table ob-grid-exp">
                  <div className="ob-grid-head">
                    <span>Occupation</span>
                    <span>Company</span>
                    <span>Summary</span>
                    <span>Duration</span>
                    <span>Currently Work Here</span>
                    <span />
                  </div>
                  {fields.map((field) => (
                    <div className="ob-grid-row" key={field.key}>
                      <Form.Item name={[field.name, 'occupation']}><Input disabled={disabled} /></Form.Item>
                      <Form.Item name={[field.name, 'company']}><Input disabled={disabled} /></Form.Item>
                      <Form.Item name={[field.name, 'summary']}><Input.TextArea rows={1} disabled={disabled} /></Form.Item>
                      <Form.Item name={[field.name, 'duration']}><Input placeholder="e.g. 2 years" disabled={disabled} /></Form.Item>
                      <Form.Item name={[field.name, 'currentlyWorkHere']}>
                        <Select placeholder="Select" allowClear disabled={disabled} options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
                      </Form.Item>
                      {disabled ? <span /> : (
                        <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove experience row" onClick={() => remove(field.name)} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Form.List>
      </div>
    </>
  )
}

export default function PulseCandidateForm({ form, mode = 'admin', reviewEmployee = false, employeeStep = 'you' }) {
  const departments = useMemo(() => DEPARTMENTS.map((d) => ({ value: d, label: d })), [])
  const isAdmin = mode === 'admin'
  const isEmployee = mode === 'employee'

  return (
    <Form
      form={form}
      layout="vertical"
      className={`ob-form${isEmployee ? ' is-employee' : ''}`}
      requiredMark
      scrollToFirstError
      initialValues={emptyCandidate}
    >
      {isEmployee ? null : (
        <Row gutter={24}>
          <Col xs={24} md={12}>
            <Form.Item
              name="firstName"
              label="First name"
            >
              <Input autoComplete="given-name" disabled={isAdmin && reviewEmployee} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="lastName"
              label="Last name"
            >
              <Input autoComplete="family-name" disabled={isAdmin && reviewEmployee} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="email"
              label="Personal email"
              rules={[
                { type: 'email', message: 'Enter a valid email' },
                { required: true, message: 'Personal email is required' },
              ]}
            >
              <Input autoComplete="email" />
            </Form.Item>
          </Col>
        </Row>
      )}

      {isAdmin ? (
        <section className="ob-section">
          <Typography.Title level={5}>Offer details</Typography.Title>
          <Row gutter={24}>
            <Col xs={24} md={12}>
              <Form.Item
                name="officialEmail"
                label="Work email"
                rules={[
                  { type: 'email', message: 'Enter a valid email' },
                  {
                    validator: (_, value) => {
                      if (!value) return Promise.resolve()
                      return isCompanyEmail(normalizeCompanyEmail(value))
                        ? Promise.resolve()
                        : Promise.reject(new Error(companyEmailRequiredMessage()))
                    },
                  },
                ]}
              >
                <Input
                  autoComplete="off"
                  placeholder="name@bda.co.in"
                  onBlur={(e) => {
                    const next = normalizeCompanyEmail(e.target.value)
                    if (next) form.setFieldValue('officialEmail', next)
                  }}
                />
              </Form.Item>
              <Form.Item name="tentativeJoiningDate" label="Joining date">
                <DatePicker format="DD-MMM-YYYY" style={{ width: '100%' }} placeholder="dd-MMM-yyyy" />
              </Form.Item>
              <Form.Item name="offerLetter" label="Offer letter">
                <FileSlot kinds="doc" hint="PDF, Word, or image · Max. size is 5 MB" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="department" label="Department">
                <Select placeholder="Select" allowClear options={departments} />
              </Form.Item>
              <Form.Item name="title" label="Title">
                <Select placeholder="Select" allowClear options={TITLES.map((s) => ({ value: s, label: s }))} />
              </Form.Item>
              <Form.Item name="workLocation" label="Location">
                <Select placeholder="Select" allowClear options={LOCATIONS.map((s) => ({ value: s, label: s }))} />
              </Form.Item>
              <Form.Item name="sourceOfHire" label="Source of hire">
                <Select placeholder="Select" allowClear options={HIRE_SOURCES.map((s) => ({ value: s, label: s }))} />
              </Form.Item>
            </Col>
          </Row>
        </section>
      ) : null}

      {isEmployee ? <EmployeeFillFields variant="public" requireDocs disabled={false} step={employeeStep} /> : null}

      {isAdmin && reviewEmployee ? (
        <section className="ob-section">
          <Typography.Title level={5}>Submitted by employee</Typography.Title>
          <EmployeeFillFields disabled requireDocs={false} />
        </section>
      ) : null}
    </Form>
  )
}
