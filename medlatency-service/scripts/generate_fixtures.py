"""Generate fictional source bundles and explicitly authored replay inputs. No network."""
import _bootstrap
from backend.common import ROOT,digest,write
from backend.models import validate_bundle,validate_extraction,publish

TIME='2026-09-12T12:00:00Z'

class Fixture:
    def __init__(self,number,name,label):
        self.pid=f'DEMO-{number:03}'
        self.bundle={'schema_version':'medlatency.patient.v1','patient':{'id':self.pid,'display_name':name,'synthetic':True},
            'dataset':{'mode':'fixture','source':'locally_authored','captured_at':TIME,'simulation_as_of':TIME,'label':label},
            'coverage':{'full_history_guaranteed':False,'sources':[{'name':'authored fixture','complete':True}],
                        'limitations':['Entirely fictional; no Anima observations. Missing evidence is not evidence of absence.']},
            'resources':[],'events':[],'links':[],'shared_context':[]}
        self.extraction={'tasks':[],'observations':[],'edges':[],'context':[label]}
    def resource(self,key,text,kind='encounter',status='completed',at='2026-09-10T09:00:00Z',data=None,links=(),clock='simulation'):
        r={'id':key,'patient_id':self.pid,'kind':kind,'title':key.replace('-',' ').title(),'source_status':status,'version':1,
           'record_created_at':at,'clinical_event_at':at,'clock':clock,'data':dict(data or {},text=text),
           'provenance':[{'origin':'authored_fixture','retrieved_at':TIME}],'source_locations':[{'file':self.pid+'.json'}],'native':{}}
        r['snapshot_id']='snap_'+digest(r)[:24];self.bundle['resources'].append(r)
        for target in links:self.bundle['links'].append({'from':key,'to':target,'relation':'fulfills_request','pointer':'/data/request_id'})
        if links:r['data']['request_id']=links[0]
        return r
    def ref(self,r,quote=None,path='/data/text'):
        return {'resource_id':r['id'],'snapshot_id':r['snapshot_id'],'pointer':path,'quote':quote or r['data']['text']}
    def task(self,key,r,label,outcome,family='unknown',required=('completed',),intent='instruction',parent=None,item=None,**kwargs):
        t={'key':key,'action_key':key,'label':label,'outcome':outcome,'family':family,'intent':intent,
           'origin':'inferred' if intent=='inferred_candidate' else 'documented','source':self.ref(r),
           'responsible':None,'condition':None,'deadline':None,'preferences':[],'uncertainties':[],
           'item':item or label,'parent_key':parent,'required_stages':list(required),'fulfillment_rule':'all'}
        t.update(kwargs);self.extraction['tasks'].append(t);return t
    def obs(self,t,r,stage,polarity='supports',lifecycle='active',quote=None):
        self.extraction['observations'].append({'task_key':t['key'],'stage':stage,'source':self.ref(r,quote),
            'item':t['item'],'polarity':polarity,'lifecycle':lifecycle,'explanation':'Authored semantic observation from the quoted source; linkage checked separately.'})
    def edge(self,a,b,r,kind='prerequisite'):
        self.extraction['edges'].append({'from_key':a['key'],'to_key':b['key'],'kind':kind,'origin':'documented','condition':None,'source':self.ref(r)})
    def save(self):
        validate_bundle(self.bundle);validate_extraction(self.extraction,self.bundle)
        write(ROOT/'fixtures/patients'/f'{self.pid}.json',self.bundle)
        write(ROOT/'fixtures/replays'/f'{digest(self.bundle)}.json',{'label':'Authored replay, not model output or evaluation ground truth','extraction':self.extraction})

def generate():
    publish();fixtures=[]
    f=Fixture(1,'Alex Rowan','Compound discharge instructions');fixtures.append(f)
    r=f.resource('discharge-letter','GP team: match the referenced panel and request the outstanding medicines note before closing the document task. Both prerequisites remain outstanding.','document','sent')
    p=f.task('close-document',r,'Close the document task','Record document processing after the two stated prerequisites','document_followup',('processing_outcome_recorded',),responsible='GP team')
    a=f.task('match-panel',r,'Match the referenced panel','Identify the panel referenced by the letter',required=('panel_matched',),parent=p['key'],responsible='GP team',item='referenced panel')
    b=f.task('request-note',r,'Request the medicines note','Send a request for the outstanding medicines note','external_document',('requested',),parent=p['key'],responsible='GP team',item='medicines note')
    for t,stage in [(p,'processing_outcome_recorded'),(a,'panel_matched'),(b,'requested')]:f.obs(t,r,stage,'pending')
    f.edge(a,p,r);f.edge(b,p,r);f.edge(a,b,r,'parallel')
    q=f.resource('note-request','Request for the medicines note sent to the ward.','communication','sent','2026-09-11T09:00:00Z',links=(r['id'],))
    # A later request resolves this subtask, without implying receipt or review.
    f.obs(b,q,'requested'); b['uncertainties'].append('Earlier pending statement describes its recorded time; the later request is not a receipt or review.')

    f=Fixture(2,'Morgan Vale','Delivered reminder, unresolved registration');fixtures.append(f)
    r=f.resource('registration-instruction','Please send a registration reminder. The patient must complete the registration paperwork.','encounter')
    a=f.task('send-reminder',r,'Send registration reminder','Send the registration reminder','communication',('sent','delivered'),item='registration reminder',fulfillment_rule='any')
    b=f.task('complete-paperwork',r,'Complete registration paperwork','Complete patient registration',required=('paperwork_completed',),responsible='patient',item='registration paperwork')
    q=f.resource('delivered-message','Registration reminder delivered. Please complete the registration paperwork.','communication','delivered',links=(r['id'],))
    f.obs(a,q,'delivered');f.obs(b,q,'reminder_delivered')

    f=Fixture(3,'Taylor Moss','Local accessible appointment with incomplete confirmation');fixtures.append(f)
    r=f.resource('appointment-request','I need an accessible local appointment. Please arrange and confirm it with me. I prefer step-free access; transport needs have not been established.','communication','received')
    a=f.task('coordinate-appointment',r,'Arrange and confirm accessible appointment','A confirmed local appointment with suitable access','appointment',('booking_arranged','confirmed','access_confirmed'),intent='patient_request',preferences=['Local','Step-free access'],item='local appointment')
    f.task('access-preference',r,'Step-free local access preference','Constrain appointment coordination',intent='preference',required=('preference_recorded',))
    q=f.resource('appointment-booking','Local appointment booked. Confirmation and step-free access checks are still pending.','appointment','booked',links=(r['id'],))
    f.obs(a,q,'booking_arranged');f.obs(a,q,'confirmed','pending');f.obs(a,q,'access_confirmed','pending')

    f=Fixture(4,'Jamie Fern','Partial blood evidence; order and review unknown');fixtures.append(f)
    r=f.resource('blood-report','Full blood count: haemoglobin 134 g/L, white cells 6.2 x10^9/L. Sample collected at 08:40. No review is recorded in this export.','diagnostic_report','available',data={'collected_at':'2026-09-10T08:40:00Z','haemoglobin':134,'white_cells':6.2})
    a=f.task('clarify-review',r,'Clarify whether the blood result was reviewed','Establish review and communication evidence','diagnostic',('reviewed','communicated'),intent='inferred_candidate',item='full blood count',uncertainties=['No documented request or linked order. This is a follow-up candidate, not a clinician instruction.'])
    f.obs(a,r,'collected');f.obs(a,r,'result_available')

    f=Fixture(5,'Casey Linden','AUTHORED COMPLETE-WORKFLOW FIXTURE — not observed in Anima');fixtures.append(f)
    r=f.resource('test-request','GP: obtain a full blood count, review the result and communicate it to the patient.','encounter','completed','2026-09-05T09:00:00Z')
    a=f.task('fbc-workflow',r,'Obtain, review and communicate full blood count','A full blood count result reviewed and communicated','diagnostic',('result_available','reviewed','communicated'),responsible='GP',item='full blood count')
    f.obs(a,r,'requested')
    prev=r['id']
    for i,(stage,text) in enumerate([('ordered','Full blood count ordered for the linked request.'),('collected','Full blood count sample collected.'),('received','Full blood count sample received by laboratory.'),('analysed','Full blood count sample analysed.'),('result_available','Full blood count result available: haemoglobin 138 g/L.'),('reviewed','GP reviewed the linked full blood count result.'),('communicated','GP communicated the reviewed full blood count result to the patient.')]):
        q=f.resource('test-'+stage,text,'diagnostic' if stage!='communicated' else 'communication','recorded',f'2026-09-{6+i//3:02}T{9+i%3:02}:00:00Z',links=(prev,))
        f.obs(a,q,stage);prev=q['id']

    f=Fixture(6,'Robin Ash','Repeat requests and an old unlinked result');fixtures.append(f)
    old=f.resource('old-fbc','Full blood count result available: haemoglobin 132 g/L.','diagnostic_report','available','2026-08-01T10:00:00Z')
    for key,date in [('first-repeat','2026-09-08T09:00:00Z'),('second-repeat','2026-09-11T09:00:00Z')]:
        r=f.resource(key,'Please arrange a repeat full blood count.','encounter','completed',date)
        a=f.task(key,r,'Arrange repeat full blood count','Obtain the newly requested full blood count','diagnostic',('result_available',),item='full blood count')
        f.obs(a,r,'requested');f.obs(a,old,'result_available')

    f=Fixture(7,'Drew Hazel','Conditional plan and negated prescription');fixtures.append(f)
    r=f.resource('conditional-note','Consider referral if symptoms persist. No prescription required.','encounter')
    f.task('conditional-referral',r,'Consider referral if symptoms persist','Assess need for referral if the condition is met',required=('referral_considered',),intent='conditional',condition='symptoms persist')
    f.task('no-prescription',r,'No prescription required','Document that prescribing is not requested',intent='negated',required=('prescribed',))

    f=Fixture(8,'Sam Willow','Cancellation followed by explicit reopening');fixtures.append(f)
    r=f.resource('initial-referral','Arrange a physiotherapy referral.','encounter','completed','2026-09-01T09:00:00Z')
    a=f.task('physio-referral',r,'Arrange physiotherapy referral','Send the physiotherapy referral',required=('referral_sent',),item='physiotherapy referral')
    q=f.resource('cancel-referral','Cancel the linked physiotherapy referral; patient declined.','encounter','completed','2026-09-03T09:00:00Z',links=(r['id'],));f.obs(a,q,'referral_sent','pending','cancelled')
    q=f.resource('reopen-referral','Reopen the linked physiotherapy referral at the patient request. Referral has not yet been sent.','encounter','completed','2026-09-11T09:00:00Z',links=(r['id'],));f.obs(a,q,'referral_sent','pending','reopened')

    f=Fixture(9,'Lee Brook','Queued telephone script is a plan, not a conversation');fixtures.append(f)
    r=f.resource('queued-call','Queued script: ask the patient to confirm their address. This call has not occurred.','telephone_call','queued',clock='wall')
    a=f.task('make-call',r,'Call patient to confirm address','Obtain address confirmation during a completed call','communication',('response_received',),intent='commitment',item='address confirmation',uncertainties=['Queued script is not a transcript. Wall-clock timing is not simulation time.'])
    f.obs(a,r,'queued');f.obs(a,r,'response_received','pending')
    for f in fixtures:f.save()
    return fixtures

if __name__=='__main__':
    print('Generated',len(generate()),'fictional bundles and authored replays. Anima was not accessed.')
